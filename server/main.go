package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"net/url"
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
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Color      string     `json:"color"`
	X          float64    `json:"x"`
	Y          float64    `json:"y"`
	Z          float64    `json:"z"`
	Punch      float64    `json:"punch"`
	PunchLeft  float64    `json:"punchLeft"`
	Rotation   float64    `json:"rotation"`
	Animation  string     `json:"animation"`
	Voice      bool       `json:"voice"`
	Speaking   float64    `json:"speaking"`
	Camera     bool       `json:"camera"`
	Appearance appearance `json:"appearance"`
	Holding    string     `json:"holding"`
	Drink      float64    `json:"drink"`
}

type input struct {
	Type       string          `json:"type"`
	Name       string          `json:"name"`
	X          float64         `json:"x"`
	Y          float64         `json:"y"`
	Z          float64         `json:"z"`
	Punch      float64         `json:"punch"`
	PunchLeft  float64         `json:"punchLeft"`
	Speaking   float64         `json:"speaking"`
	Rotation   float64         `json:"rotation"`
	Animation  string          `json:"animation"`
	Text       string          `json:"text"`
	URL        string          `json:"url"`
	Enabled    *bool           `json:"enabled"`
	To         string          `json:"to"`
	Kind       string          `json:"kind"`
	Data       json.RawMessage `json:"data"`
	Session    string          `json:"session"`
	SDP        string          `json:"sdp"`
	Appearance json.RawMessage `json:"appearance"`
	Token      string          `json:"token"`
	Desk       *int            `json:"desk"`
	Style      json.RawMessage `json:"style"`
	Note       string          `json:"note"`
	Action     string          `json:"action"`
	Drink      float64         `json:"drink"`
}

// Keep in sync with fridge and FRIDGE_REACH in client/src/world.ts.
const (
	fridgeX     = 14.6
	fridgeZ     = -2.8
	fridgeReach = 2.0
	maxDrink    = 1.2
)

func nearFridge(p player) bool {
	return math.Hypot(p.X-fridgeX, p.Z-fridgeZ) <= fridgeReach
}

type appearance struct {
	Top           string `json:"top"`
	Bottom        string `json:"bottom"`
	Shoes         string `json:"shoes"`
	TopColor      string `json:"topColor"`
	BottomColor   string `json:"bottomColor"`
	ShoeColor     string `json:"shoeColor"`
	Skin          string `json:"skin"`
	Hair          string `json:"hair"`
	HairColor     string `json:"hairColor"`
	Hat           string `json:"hat"`
	HatColor      string `json:"hatColor"`
	Backpack      bool   `json:"backpack"`
	BackpackColor string `json:"backpackColor"`
	Face          string `json:"face"`
}

func oneOf(value string, choices ...string) bool {
	for _, choice := range choices {
		if value == choice {
			return true
		}
	}
	return false
}

func clothingColor(value string) bool {
	return oneOf(value, "#52d6b1", "#ffb86b", "#b69cff", "#72baff", "#ff7c9a", "#25333e", "#fff0d3", "#b58453")
}

func defaultAppearance(color string) appearance {
	if !clothingColor(color) {
		color = "#52d6b1"
	}
	return appearance{
		Top: "tee", Bottom: "trousers", Shoes: "boots", TopColor: color,
		BottomColor: "#25333e", ShoeColor: "#b58453", Skin: "#efc9a9",
		Hair: "short", HairColor: "#a65d45", Hat: "none", HatColor: "#25333e",
		Backpack: true, BackpackColor: "#b58453", Face: "smile",
	}
}

func parseAppearance(raw json.RawMessage) (appearance, bool) {
	var a appearance
	if len(raw) == 0 || len(raw) > 1024 {
		return a, false
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || len(fields) != 14 {
		return a, false
	}
	for _, key := range []string{"top", "bottom", "shoes", "topColor", "bottomColor", "shoeColor",
		"skin", "hair", "hairColor", "hat", "hatColor", "backpack", "backpackColor", "face"} {
		value, ok := fields[key]
		if !ok || string(value) == "null" {
			return a, false
		}
	}
	if json.Unmarshal(raw, &a) != nil {
		return a, false
	}
	return a, oneOf(a.Top, "tee", "hoodie", "jacket") &&
		oneOf(a.Bottom, "trousers", "shorts") && oneOf(a.Shoes, "boots", "sneakers") &&
		oneOf(a.Hair, "short", "bob", "none") && oneOf(a.Hat, "none", "beanie", "cap") &&
		oneOf(a.Face, "smile", "neutral", "surprised") &&
		clothingColor(a.TopColor) && clothingColor(a.BottomColor) && clothingColor(a.ShoeColor) &&
		clothingColor(a.HatColor) && clothingColor(a.BackpackColor) &&
		oneOf(a.Skin, "#f7dfcf", "#efc9a9", "#d9a47c", "#b97953", "#885438", "#533528") &&
		oneOf(a.HairColor, "#a65d45", "#25333e", "#51382c", "#805539", "#d5b477", "#c4c5c3")
}

type peer struct {
	conn              *websocket.Conn
	send              chan []byte
	done              chan struct{}
	once              sync.Once
	player            player
	lastMove          time.Time
	lastGIF           time.Time
	lastInput         time.Time
	joined            bool
	signalWindow      time.Time
	signalCount       int
	cameraSignalStart time.Time
	cameraSignalCount int
	tokenHash         string
	deskWindow        time.Time
	deskCount         int
	lastNote          time.Time
	lastInteract      time.Time
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
	commands   chan command
	peers      map[*peer]bool
	desks      [len(deskPositions)]*desk
	desksPath  string
	fridgeOpen bool
}

func newHub() *hub {
	return &hub{commands: make(chan command, 128), peers: make(map[*peer]bool)}
}

func (h *hub) saveDesks() {
	if err := saveDesks(h.desksPath, h.desks); err != nil {
		log.Printf("desks: save failed: %v", err)
	}
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

// Shared room objects travel with every welcome and snapshot.
func (h *hub) world() map[string]any {
	return map[string]any{"fridgeOpen": h.fridgeOpen}
}

func (h *hub) snapshot() map[string]any {
	return map[string]any{"type": "snapshot", "players": h.players(), "world": h.world()}
}

func (h *hub) players() []player {
	result := make([]player, 0, len(h.peers))
	for p := range h.peers {
		state := p.player
		// A suspended/background renderer must not leave a mouth stuck open.
		if time.Since(p.lastMove) > time.Second {
			state.Speaking = 0
		}
		result = append(result, state)
	}
	return result
}

func validMove(p *peer, m input, now time.Time) bool {
	if math.IsNaN(m.Speaking) || math.IsInf(m.Speaking, 0) || m.Speaking < 0 || m.Speaking > 1 {
		return false
	}
	if math.IsNaN(m.Drink) || math.IsInf(m.Drink, 0) || m.Drink < 0 || m.Drink > maxDrink {
		return false
	}
	if math.IsNaN(m.X) || math.IsNaN(m.Y) || math.IsNaN(m.Z) || math.IsNaN(m.Punch) || math.IsNaN(m.PunchLeft) || math.IsNaN(m.Rotation) ||
		math.IsInf(m.X, 0) || math.IsInf(m.Y, 0) || math.IsInf(m.Z, 0) || math.IsInf(m.Punch, 0) || math.IsInf(m.PunchLeft, 0) || math.IsInf(m.Rotation, 0) {
		return false
	}
	if math.Abs(m.X) > 23.5 || math.Abs(m.Z) > 23.5 || math.Abs(m.Rotation) > math.Pi*2 ||
		m.Y < 0 || m.Y > 3.5 || m.Punch < 0 || m.Punch > 0.32 || m.PunchLeft < 0 || m.PunchLeft > 0.32 {
		return false
	}
	// Allow for jitter, but cap elapsed time to prevent teleporting after idling.
	elapsed := math.Min(now.Sub(p.lastMove).Seconds(), 0.5)
	return math.Hypot(m.X-p.player.X, m.Z-p.player.Z) <= 6*elapsed+0.25
}

// Validate only the bounded WebRTC fields we relay; never trust a supplied source ID.
func validSignal(kind string, data json.RawMessage) bool {
	if kind != "offer" && kind != "answer" && kind != "ice" {
		return false
	}
	if kind == "ice" && string(data) == "null" {
		return true
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(data, &fields) != nil || fields == nil {
		return false
	}
	stringField := func(key string, max int) bool {
		var s string
		raw, ok := fields[key]
		return ok && string(raw) != "null" && json.Unmarshal(raw, &s) == nil && len(s) <= max
	}
	if kind != "ice" {
		var descriptionType string
		return len(fields) == 2 && json.Unmarshal(fields["type"], &descriptionType) == nil &&
			descriptionType == kind && stringField("sdp", 16000)
	}
	if !stringField("candidate", 4096) {
		return false
	}
	for key, raw := range fields {
		switch key {
		case "candidate":
		case "sdpMid", "usernameFragment":
			if string(raw) != "null" && !stringField(key, 256) {
				return false
			}
		case "sdpMLineIndex":
			if string(raw) != "null" {
				var index int
				if json.Unmarshal(raw, &index) != nil || index < 0 || index > 65535 {
					return false
				}
			}
		default:
			return false
		}
	}
	return true
}

// Only direct media links are accepted. The server never fetches the URL.
func validGIFURL(value string) bool {
	if len(value) > 1500 || strings.TrimSpace(value) != value {
		return false
	}
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.User != nil || (u.Port() != "" && u.Port() != "443") || u.Fragment != "" ||
		!strings.HasSuffix(strings.ToLower(u.Path), ".gif") {
		return false
	}
	switch strings.ToLower(u.Hostname()) {
	case "media.tenor.com", "media.giphy.com", "i.giphy.com",
		"media0.giphy.com", "media1.giphy.com", "media2.giphy.com",
		"media3.giphy.com", "media4.giphy.com", "cdn.discordapp.com", "media.discordapp.net":
		return true
	}
	return false
}

func (h *hub) handle(c command, now time.Time) {
	p, m := c.peer, c.input
	if c.leave {
		if h.peers[p] {
			delete(h.peers, p)
			if len(h.peers) == 0 {
				h.fridgeOpen = false
			}
			h.broadcast(map[string]any{"type": "leave", "id": p.player.ID})
			if h.ownedDesk(p.tokenHash) >= 0 {
				h.broadcastDesks() // The owner's status light may turn offline.
			}
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
		p.player.Voice = false
		p.player.Speaking = 0
		p.player.Camera = false
		p.player.Holding = "none"
		p.player.Drink = 0
		p.player.Z = 6
		p.player.Appearance = defaultAppearance(p.player.Color)
		if selected, valid := parseAppearance(m.Appearance); valid {
			p.player.Appearance = selected
		}
		p.player.Color = p.player.Appearance.TopColor
		if validToken(m.Token) {
			p.tokenHash = hashToken(m.Token)
		}
		p.lastMove = now
		p.joined = true
		h.peers[p] = true
		h.send(p, map[string]any{"type": "welcome", "id": p.player.ID, "players": h.players(), "world": h.world()})
		h.broadcast(map[string]any{"type": "join", "player": p.player})
		if h.ownedDesk(p.tokenHash) >= 0 {
			h.broadcastDesks() // The owner's status light comes back online.
		} else {
			h.send(p, h.desksFor(p))
		}
		return
	}
	if !h.peers[p] {
		return
	}
	switch m.Type {
	case "desk-claim", "desk-release", "desk-update", "desk-note", "desk-note-remove":
		if h.handleDesk(p, m, now) {
			h.saveDesks()
			h.broadcastDesks()
		}
	case "appearance":
		if selected, valid := parseAppearance(m.Appearance); valid {
			p.player.Appearance = selected
			p.player.Color = selected.TopColor
			h.broadcast(h.snapshot())
		}
	case "voice":
		if m.Enabled != nil {
			p.player.Voice = *m.Enabled
			if !p.player.Voice {
				p.player.Speaking = 0
			}
		}
	case "signal":
		if now.Sub(p.signalWindow) >= time.Second {
			p.signalWindow, p.signalCount = now, 0
		}
		p.signalCount++
		if p.signalCount > 80 || !p.player.Voice || m.To == p.player.ID || !validSignal(m.Kind, m.Data) {
			return
		}
		for target := range h.peers {
			if target.player.ID == m.To && target.player.Voice {
				h.send(target, map[string]any{
					"type": "signal", "from": p.player.ID, "kind": m.Kind, "data": m.Data,
				})
				break
			}
		}
	case "camera":
		if m.Enabled != nil && p.player.Camera != *m.Enabled {
			p.player.Camera = *m.Enabled
			h.broadcast(h.snapshot())
		}
	case "camera-signal":
		// Only relay bounded SDP to another joined player. Identity is server-owned.
		if now.Sub(p.cameraSignalStart) >= time.Second {
			p.cameraSignalStart, p.cameraSignalCount = now, 0
		}
		p.cameraSignalCount++
		if p.cameraSignalCount > 40 || len(m.Session) == 0 || len(m.Session) > 64 ||
			len(m.SDP) == 0 || len(m.SDP) > 16384 ||
			(m.Kind != "offer" && m.Kind != "answer") {
			return
		}
		for target := range h.peers {
			if target != p && target.player.ID == m.To &&
				((m.Kind == "offer" && p.player.Camera) || (m.Kind == "answer" && target.player.Camera)) {
				h.send(target, map[string]any{
					"type": "camera-signal", "from": p.player.ID, "session": m.Session,
					"kind": m.Kind, "sdp": m.SDP,
				})
				break
			}
		}
	case "gif":
		if !validGIFURL(m.URL) || now.Sub(p.lastGIF) < 2*time.Second {
			return
		}
		p.lastGIF = now
		h.broadcast(map[string]any{"type": "gif", "id": p.player.ID, "url": m.URL})
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
		p.player.Y, p.player.Punch = m.Y, m.Punch
		p.player.PunchLeft = m.PunchLeft
		p.player.Drink = 0
		if p.player.Holding == "beer" {
			p.player.Drink = m.Drink
		}
		p.player.Speaking = 0
		if p.player.Voice {
			p.player.Speaking = m.Speaking
		}
		p.player.Animation = "idle"
		if m.Animation == "walk" || m.Animation == "sit" {
			p.player.Animation = m.Animation
		}
		p.lastMove = now
	case "interact":
		// Cosmetic shared state: the hub owns the door; each player owns only their hands.
		if now.Sub(p.lastInteract) < 250*time.Millisecond {
			return
		}
		changed := false
		switch m.Action {
		case "toggle-fridge":
			if nearFridge(p.player) {
				h.fridgeOpen = !h.fridgeOpen
				changed = true
			}
		case "take-beer":
			if h.fridgeOpen && nearFridge(p.player) && p.player.Holding != "beer" {
				p.player.Holding = "beer"
				changed = true
			}
		case "drop":
			if p.player.Holding == "beer" {
				p.player.Holding, p.player.Drink = "none", 0
				changed = true
			}
		}
		if changed {
			p.lastInteract = now
			h.broadcast(h.snapshot())
		}
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
				h.broadcast(h.snapshot())
			}
		}
	}
}

func (h *hub) serve(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil) // Same origin; Vite/nginx proxy the connection.
	if err != nil {
		return
	}
	conn.SetReadLimit(32768)
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
	h.desksPath = os.Getenv("DESKS_FILE")
	h.desks = loadDesks(h.desksPath)
	go h.run(ctx)
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) { h.serve(ctx, w, r) })
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8081"
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
