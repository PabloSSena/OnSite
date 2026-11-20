package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode"

	"github.com/coder/websocket"
)

const maxPlayers = 10

type player struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Color     string  `json:"color"`
	X         float64 `json:"x"`
	Z         float64 `json:"z"`
	Rotation  float64 `json:"rotation"`
	Animation string  `json:"animation"`
	Camera    bool    `json:"camera"`
}

type input struct {
	Type      string  `json:"type"`
	Name      string  `json:"name"`
	X         float64 `json:"x"`
	Z         float64 `json:"z"`
	Rotation  float64 `json:"rotation"`
	Animation string  `json:"animation"`
	Text      string  `json:"text"`
	Enabled   bool    `json:"enabled"`
	To        string  `json:"to"`
	Session   string  `json:"session"`
	Kind      string  `json:"kind"`
	SDP       string  `json:"sdp"`
}

type peer struct {
	conn        *websocket.Conn
	send        chan []byte
	done        chan struct{}
	once        sync.Once
	player      player
	lastMove    time.Time
	lastChat    time.Time
	lastInput   time.Time
	signalStart time.Time
	signalCount int
	joined      bool
}

func (p *peer) stop() {
	p.once.Do(func() {
		close(p.done)
		p.conn.CloseNow()
	})
}

type command struct {
	peer  *peer
	input input
	leave bool
}

type hub struct {
	commands chan command
	peers    map[*peer]bool
}

func newHub() *hub {
	return &hub{commands: make(chan command, 128), peers: make(map[*peer]bool)}
}

func clean(s string, max int) string {
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, s)
	r := []rune(strings.TrimSpace(s))
	if len(r) > max {
		r = r[:max]
	}
	return string(r)
}

func (h *hub) send(p *peer, v any) {
	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("encode: %v", err)
		return
	}
	select {
	case p.send <- data:
	default:
		// A slow client must not block the room.
		p.stop()
	}
}

func (h *hub) broadcast(v any) {
	for p := range h.peers {
		h.send(p, v)
	}
}

func (h *hub) players() []player {
	result := make([]player, 0, len(h.peers))
	for p := range h.peers {
		result = append(result, p.player)
	}
	return result
}

func validMove(p *peer, m input, now time.Time) bool {
	if math.IsNaN(m.X) || math.IsNaN(m.Z) || math.IsNaN(m.Rotation) ||
		math.IsInf(m.X, 0) || math.IsInf(m.Z, 0) || math.IsInf(m.Rotation, 0) {
		return false
	}
	if math.Abs(m.X) > 9.5 || math.Abs(m.Z) > 9.5 || math.Abs(m.Rotation) > math.Pi*2 {
		return false
	}
	// Allow for jitter, but cap elapsed time to prevent teleporting after idling.
	elapsed := math.Min(now.Sub(p.lastMove).Seconds(), 0.5)
	return math.Hypot(m.X-p.player.X, m.Z-p.player.Z) <= 6*elapsed+0.25
}

func (h *hub) handle(c command, now time.Time) {
	p, m := c.peer, c.input
	if c.leave {
		if h.peers[p] {
			delete(h.peers, p)
			h.broadcast(map[string]any{"type": "leave", "id": p.player.ID})
		}
		return
	}
	if !p.joined {
		if m.Type != "join" || len(h.peers) >= maxPlayers {
			p.stop()
			return
		}
		p.player.Name = clean(m.Name, 24)
		if p.player.Name == "" {
			p.player.Name = "Guest"
		}
		p.player.Animation = "idle"
		p.player.Z = 6
		p.lastMove = now
		p.joined = true
		h.peers[p] = true
		h.send(p, map[string]any{"type": "welcome", "id": p.player.ID, "players": h.players()})
		h.broadcast(map[string]any{"type": "join", "player": p.player})
		return
	}
	switch m.Type {
	case "camera":
		if p.player.Camera != m.Enabled {
			p.player.Camera = m.Enabled
			h.broadcast(map[string]any{"type": "snapshot", "players": h.players()})
		}
	case "signal":
		// Only relay bounded SDP to another joined player. Identity is server-owned.
		if now.Sub(p.signalStart) >= time.Second {
			p.signalStart, p.signalCount = now, 0
		}
		p.signalCount++
		if p.signalCount > 40 || len(m.Session) == 0 || len(m.Session) > 64 ||
			len(m.SDP) == 0 || len(m.SDP) > 16384 ||
			(m.Kind != "offer" && m.Kind != "answer") {
			return
		}
		for target := range h.peers {
			if target != p && target.player.ID == m.To &&
				((m.Kind == "offer" && p.player.Camera) || (m.Kind == "answer" && target.player.Camera)) {
				h.send(target, map[string]any{
					"type": "signal", "from": p.player.ID, "session": m.Session,
					"kind": m.Kind, "sdp": m.SDP,
				})
				break
			}
		}
	case "move":
		if now.Sub(p.lastInput) < 30*time.Millisecond {
			return
		}
		p.lastInput = now
		if !validMove(p, m, now) {
			h.send(p, map[string]any{"type": "correction", "player": p.player})
			return
		}
		p.player.X, p.player.Z, p.player.Rotation = m.X, m.Z, m.Rotation
		p.player.Animation = "idle"
		if m.Animation == "walk" {
			p.player.Animation = "walk"
		}
		p.lastMove = now
	case "chat":
		text := clean(m.Text, 300)
		if text == "" || now.Sub(p.lastChat) < 400*time.Millisecond {
			return
		}
		p.lastChat = now
		h.broadcast(map[string]any{
			"type": "chat", "id": p.player.ID, "name": p.player.Name,
			"text": text, "at": now.UTC().Format(time.RFC3339),
		})
	}
}

func (h *hub) run(ctx context.Context) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	defer func() {
		for p := range h.peers {
			p.stop()
		}
	}()
	for {
		select {
		case <-ctx.Done():
			return
		case c := <-h.commands:
			h.handle(c, time.Now())
		case <-ticker.C:
			if len(h.peers) > 0 {
				h.broadcast(map[string]any{"type": "snapshot", "players": h.players()})
			}
		}
	}
}

func (h *hub) serve(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil) // Same origin; Vite/nginx proxy the connection.
	if err != nil {
		return
	}
	conn.SetReadLimit(20 * 1024)
	id := make([]byte, 8)
	if _, err := rand.Read(id); err != nil {
		conn.CloseNow()
		return
	}
	colors := []string{"#52d6b1", "#ffb86b", "#b69cff", "#72baff", "#ff7c9a"}
	p := &peer{
		conn: conn, send: make(chan []byte, 64), done: make(chan struct{}),
		player: player{ID: hex.EncodeToString(id), Color: colors[int(id[0])%len(colors)]},
	}
	defer p.stop()
	defer func() {
		select {
		case h.commands <- command{peer: p, leave: true}:
		case <-ctx.Done():
		}
	}()
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				p.stop()
				return
			case <-p.done:
				return
			case data := <-p.send:
				writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				err := conn.Write(writeCtx, websocket.MessageText, data)
				cancel()
				if err != nil {
					p.stop()
					return
				}
			case <-ticker.C:
				pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				err := conn.Ping(pingCtx)
				cancel()
				if err != nil {
					p.stop()
					return
				}
			}
		}
	}()
	// The handshake has a deadline; afterward, ping/pong detects dead connections.
	readCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	first := true
	for {
		_, data, err := conn.Read(readCtx)
		if err != nil {
			return
		}
		var m input
		if json.Unmarshal(data, &m) != nil {
			return
		}
		select {
		case h.commands <- command{peer: p, input: m}:
		case <-ctx.Done():
			return
		case <-p.done:
			return
		}
		if first {
			cancel()
			readCtx = ctx
			first = false
		}
	}
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	h := newHub()
	go h.run(ctx)
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) { h.serve(ctx, w, r) })
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	server := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		server.Shutdown(shutdownCtx)
	}()
	log.Printf("office server listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
