package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

func validStyleJSON(t *testing.T, change func(map[string]any)) json.RawMessage {
	t.Helper()
	style := map[string]any{
		"top": "walnut", "chairColor": "#ff7c9a", "lampColor": "#72baff", "lampOn": false,
		"keyboardColor": "#25333e", "wallpaper": "ocean", "items": []string{"cactus", "duck", "lavalamp"},
		"plate": "Ana 🌵", "mood": "shipping things", "status": "busy",
		"poster":       "https://media.tenor.com/example/desk.gif",
		"wallpaperURL": "https://i.imgur.com/example.png",
	}
	if change != nil {
		change(style)
	}
	raw, err := json.Marshal(style)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestDeskStyleValidation(t *testing.T) {
	if s, ok := parseDeskStyle(validStyleJSON(t, nil)); !ok || s.Plate != "Ana 🌵" || s.Items[2] != "lavalamp" {
		t.Fatalf("valid style rejected: %+v", s)
	}
	s, ok := parseDeskStyle(validStyleJSON(t, func(m map[string]any) {
		m["plate"] = "  " + strings.Repeat("é", 30) + "\u0007"
		m["poster"] = ""
	}))
	if !ok || s.Plate != strings.Repeat("é", deskPlateMax) || s.Poster != "" {
		t.Fatalf("plate was not normalized: %q %v", s.Plate, ok)
	}
	for name, change := range map[string]func(map[string]any){
		"missing field":      func(m map[string]any) { delete(m, "mood") },
		"unknown field":      func(m map[string]any) { m["html"] = "<b>" },
		"null field":         func(m map[string]any) { m["status"] = nil },
		"unknown top":        func(m map[string]any) { m["top"] = "glass" },
		"arbitrary color":    func(m map[string]any) { m["chairColor"] = "#123456" },
		"unknown wallpaper":  func(m map[string]any) { m["wallpaper"] = "https://evil.test/x.png" },
		"unknown item":       func(m map[string]any) { m["items"] = []string{"none", "sword", "none"} },
		"too few items":      func(m map[string]any) { m["items"] = []string{"none", "none"} },
		"too many items":     func(m map[string]any) { m["items"] = []string{"none", "none", "none", "none"} },
		"unknown status":     func(m map[string]any) { m["status"] = "asleep" },
		"lamp as string":     func(m map[string]any) { m["lampOn"] = "yes" },
		"poster host":        func(m map[string]any) { m["poster"] = "https://evil.test/a.gif" },
		"absurd mood length": func(m map[string]any) { m["mood"] = strings.Repeat("a", 1000) },
		"http wallpaper":     func(m map[string]any) { m["wallpaperURL"] = "http://i.imgur.com/a.png" },
		"null wallpaper":     func(m map[string]any) { m["wallpaperURL"] = nil },
	} {
		if _, ok := parseDeskStyle(validStyleJSON(t, change)); ok {
			t.Errorf("%s accepted", name)
		}
	}
	if _, ok := parseDeskStyle(json.RawMessage(`null`)); ok {
		t.Error("null style accepted")
	}
}

func TestDeskPositionsMatchClientWorld(t *testing.T) {
	source, err := os.ReadFile(filepath.Join("..", "client", "src", "world.ts"))
	if err != nil {
		t.Skip("client source not available:", err)
	}
	line := regexp.MustCompile(`export const desks = \[(.*)\] as const`).FindSubmatch(source)
	if line == nil {
		t.Fatal("desks table not found in world.ts")
	}
	var client [][2]float64
	if err := json.Unmarshal([]byte("["+string(line[1])+"]"), &client); err != nil {
		t.Fatal(err)
	}
	if len(client) != len(deskPositions) {
		t.Fatalf("client has %d desks, server %d", len(client), len(deskPositions))
	}
	for i := range client {
		if client[i] != deskPositions[i] {
			t.Errorf("desk %d: client %v, server %v", i, client[i], deskPositions[i])
		}
	}
}

type deskView struct {
	Type  string `json:"type"`
	Mine  *int   `json:"mine"`
	Desks []struct {
		ID        int    `json:"id"`
		OwnerName string `json:"ownerName"`
		Online    bool   `json:"online"`
		Style     *struct {
			Top   string `json:"top"`
			Plate string `json:"plate"`
		} `json:"style"`
		Notes []struct {
			ID     string `json:"id"`
			Author string `json:"author"`
			Text   string `json:"text"`
			Yours  bool   `json:"yours"`
		} `json:"notes"`
	} `json:"desks"`
}

// lastDesks drains a peer's queue and returns the most recent desks message.
func lastDesks(t *testing.T, p *peer) (view deskView, raw string) {
	t.Helper()
	for {
		select {
		case data := <-p.send:
			var probe struct{ Type string }
			if json.Unmarshal(data, &probe) == nil && probe.Type == "desks" {
				raw = string(data)
				if err := json.Unmarshal(data, &view); err != nil {
					t.Fatal(err)
				}
			}
		default:
			if raw == "" {
				t.Fatal("no desks message was sent")
			}
			return view, raw
		}
	}
}

func joinPeer(h *hub, id, name, token string, now time.Time) *peer {
	p := &peer{send: make(chan []byte, 64), done: make(chan struct{}), player: player{ID: id, Color: "#52d6b1"}}
	h.handle(command{peer: p, input: input{Type: "join", Name: name, Token: token}}, now)
	return p
}

func deskCmd(h *hub, p *peer, m input, now time.Time) {
	h.handle(command{peer: p, input: m}, now)
}

func at(p *peer, desk int) {
	p.player.X, p.player.Z = deskPositions[desk][0], deskPositions[desk][1]+2
}

func ptr(i int) *int { return &i }

const tokenA = "0123456789abcdef0123456789abcdef"
const tokenB = "fedcba9876543210fedcba9876543210"

func TestDeskClaimOwnershipAndPrivacy(t *testing.T) {
	h := newHub()
	now := time.Now()
	ana := joinPeer(h, "a", "Ana", tokenA, now)
	bo := joinPeer(h, "b", "Bo", tokenB, now)
	guest := joinPeer(h, "g", "Guest", "", now)
	if view, _ := lastDesks(t, ana); len(view.Desks) != len(deskPositions) || view.Mine != nil {
		t.Fatalf("join must send an empty desk list: %+v", view)
	}
	lastDesks(t, bo)
	lastDesks(t, guest)

	// Too far from the desk, then without a token: nothing changes.
	deskCmd(h, ana, input{Type: "desk-claim", Desk: ptr(0)}, now)
	at(guest, 0)
	deskCmd(h, guest, input{Type: "desk-claim", Desk: ptr(0)}, now)
	deskCmd(h, ana, input{Type: "desk-claim", Desk: ptr(99)}, now)
	if h.desks[0] != nil || len(ana.send) != 0 {
		t.Fatal("far, tokenless, or out-of-range claims must be ignored")
	}
	at(ana, 0)
	deskCmd(h, ana, input{Type: "desk-claim", Desk: ptr(0)}, now)
	view, raw := lastDesks(t, ana)
	if view.Mine == nil || *view.Mine != 0 || view.Desks[0].OwnerName != "Ana" || !view.Desks[0].Online ||
		view.Desks[0].Style == nil || view.Desks[0].Style.Plate != "Ana" {
		t.Fatalf("claim not reflected: %s", raw)
	}
	if strings.Contains(raw, hashToken(tokenA)) || strings.Contains(raw, tokenA) || strings.Contains(raw, "ownerHash") {
		t.Fatal("desk messages must never expose tokens or hashes")
	}
	if view, _ := lastDesks(t, bo); view.Mine != nil || view.Desks[0].OwnerName != "Ana" {
		t.Fatal("others must see the claim but not own it")
	}
	// One desk per owner; a claimed desk cannot be taken.
	at(ana, 1)
	deskCmd(h, ana, input{Type: "desk-claim", Desk: ptr(1)}, now)
	at(bo, 0)
	deskCmd(h, bo, input{Type: "desk-claim", Desk: ptr(0)}, now)
	if h.desks[1] != nil || h.desks[0].OwnerName != "Ana" {
		t.Fatal("second claim or takeover accepted")
	}
	// Only the owner can update or release.
	deskCmd(h, bo, input{Type: "desk-update", Desk: ptr(0), Style: validStyleJSON(t, nil)}, now)
	deskCmd(h, bo, input{Type: "desk-release", Desk: ptr(0)}, now)
	if h.desks[0] == nil || h.desks[0].Style.Top != "oak" {
		t.Fatal("non-owner changed the desk")
	}
	deskCmd(h, ana, input{Type: "desk-update", Desk: ptr(0), Style: validStyleJSON(t, nil)}, now)
	if view, _ := lastDesks(t, bo); view.Desks[0].Style.Top != "walnut" {
		t.Fatal("owner update was not broadcast")
	}
	deskCmd(h, ana, input{Type: "desk-update", Desk: ptr(0), Style: json.RawMessage(`{"top":"walnut"}`)}, now)
	if h.desks[0].Style.Top != "walnut" || h.desks[0].Style.Wallpaper != "ocean" {
		t.Fatal("partial update must be rejected without changes")
	}
	// Leaving turns the status light offline for everyone else.
	h.handle(command{peer: ana, leave: true}, now)
	if view, _ := lastDesks(t, bo); view.Desks[0].Online {
		t.Fatal("owner should appear offline after leaving")
	}
	// Reconnecting with the same token restores ownership.
	again := joinPeer(h, "a2", "Ana", tokenA, now)
	if view, _ := lastDesks(t, again); view.Mine == nil || *view.Mine != 0 || !view.Desks[0].Online {
		t.Fatal("same token must keep the desk across reconnects")
	}
	deskCmd(h, again, input{Type: "desk-release", Desk: ptr(0)}, now)
	if h.desks[0] != nil {
		t.Fatal("owner release failed")
	}
}

func TestDeskUpdateRateLimit(t *testing.T) {
	h := newHub()
	now := time.Now()
	ana := joinPeer(h, "a", "Ana", tokenA, now)
	at(ana, 3)
	deskCmd(h, ana, input{Type: "desk-claim", Desk: ptr(3)}, now)
	tops := []string{"white", "black", "mint", "apricot", "lavender", "sky", "rose"}
	for _, top := range tops {
		deskCmd(h, ana, input{Type: "desk-update", Desk: ptr(3), Style: validStyleJSON(t, func(m map[string]any) { m["top"] = top })}, now)
	}
	if h.desks[3].Style.Top != "lavender" { // the 5th of 7 updates
		t.Fatalf("expected 5 updates per second, last accepted %q", h.desks[3].Style.Top)
	}
	deskCmd(h, ana, input{Type: "desk-update", Desk: ptr(3), Style: validStyleJSON(t, func(m map[string]any) { m["top"] = "rose" })}, now.Add(time.Second))
	if h.desks[3].Style.Top != "rose" {
		t.Fatal("rate limit window did not reset")
	}
}

func TestDeskNotes(t *testing.T) {
	h := newHub()
	now := time.Now()
	ana := joinPeer(h, "a", "Ana", tokenA, now)
	bo := joinPeer(h, "b", "Bo", tokenB, now)
	cy := joinPeer(h, "c", "Cy", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", now)
	at(ana, 2)
	deskCmd(h, ana, input{Type: "desk-claim", Desk: ptr(2)}, now)
	deskCmd(h, bo, input{Type: "desk-note", Desk: ptr(2), Text: "far away"}, now)
	if len(h.desks[2].Notes) != 0 {
		t.Fatal("notes require being at the desk")
	}
	at(bo, 2)
	at(cy, 2)
	deskCmd(h, bo, input{Type: "desk-note", Desk: ptr(2), Text: "  hi Ana!  "}, now)
	deskCmd(h, bo, input{Type: "desk-note", Desk: ptr(2), Text: "spam"}, now.Add(time.Second))
	deskCmd(h, cy, input{Type: "desk-note", Desk: ptr(2), Text: strings.Repeat("x", 200)}, now)
	notes := h.desks[2].Notes
	if len(notes) != 2 || notes[0].Text != "hi Ana!" || notes[0].Author != "Bo" || len([]rune(notes[1].Text)) != deskNoteMax {
		t.Fatalf("unexpected notes: %+v", notes)
	}
	view, _ := lastDesks(t, bo)
	if !view.Desks[2].Notes[0].Yours || view.Desks[2].Notes[1].Yours {
		t.Fatal("yours must be computed per recipient")
	}
	// Cy cannot remove Bo's note; Bo can; the owner can remove anyone's.
	deskCmd(h, cy, input{Type: "desk-note-remove", Desk: ptr(2), Note: notes[0].ID}, now)
	if len(h.desks[2].Notes) != 2 {
		t.Fatal("a stranger removed a note")
	}
	deskCmd(h, bo, input{Type: "desk-note-remove", Desk: ptr(2), Note: notes[0].ID}, now)
	deskCmd(h, ana, input{Type: "desk-note-remove", Desk: ptr(2), Note: h.desks[2].Notes[0].ID}, now)
	if len(h.desks[2].Notes) != 0 {
		t.Fatal("author or owner removal failed")
	}
	for i := 0; i < maxDeskNotes+2; i++ {
		deskCmd(h, bo, input{Type: "desk-note", Desk: ptr(2), Text: string(rune('a' + i))}, now.Add(time.Duration(10+i*5)*time.Second))
	}
	if n := h.desks[2].Notes; len(n) != maxDeskNotes || n[0].Text != "c" {
		t.Fatalf("oldest notes should drop: %+v", n)
	}
}

func TestDeskPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "desks.json")
	h := newHub()
	h.desksPath = path
	now := time.Now()
	ana := joinPeer(h, "a", "Ana", tokenA, now)
	at(ana, 9)
	deskCmd(h, ana, input{Type: "desk-claim", Desk: ptr(9)}, now)
	deskCmd(h, ana, input{Type: "desk-update", Desk: ptr(9), Style: validStyleJSON(t, nil)}, now)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), tokenA) {
		t.Fatal("raw tokens must never be persisted")
	}
	loaded := loadDesks(path)
	if loaded[9] == nil || loaded[9].Style.Top != "walnut" || loaded[9].OwnerHash != hashToken(tokenA) {
		t.Fatalf("round trip failed: %+v", loaded[9])
	}
	if empty := loadDesks(filepath.Join(t.TempDir(), "missing.json")); empty != [len(deskPositions)]*desk{} {
		t.Fatal("a missing file should load empty desks")
	}
	for _, bad := range []string{`{not json`, `{"version":2,"desks":[]}`,
		`{"version":1,"desks":[{"ownerHash":"short","ownerName":"x","style":{},"notes":[]}]}`} {
		if err := os.WriteFile(path, []byte(bad), 0o600); err != nil {
			t.Fatal(err)
		}
		if loaded := loadDesks(path); loaded != [len(deskPositions)]*desk{} {
			t.Fatalf("corrupt file %q loaded desks", bad)
		}
		if _, err := os.Stat(path + ".corrupt"); err != nil {
			t.Fatalf("corrupt file was not moved aside: %v", err)
		}
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatal("corrupt file should no longer be at the original path")
		}
	}
}

func TestWallpaperURLPolicy(t *testing.T) {
	for _, value := range []string{
		"https://i.imgur.com/abc.png",
		"https://images.unsplash.com/photo-1506744038136?w=1200&q=80",
		"https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg",
		"https://example.com:443/wall",
	} {
		if !validImageURL(value) {
			t.Errorf("valid wallpaper rejected: %q", value)
		}
	}
	for _, value := range []string{
		"", "http://i.imgur.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA",
		"https://user:pass@i.imgur.com/a.png", "https://i.imgur.com:8443/a.png",
		"https://i.imgur.com/a.png#frag", " https://i.imgur.com/a.png", "https:///nohost.png",
		"https://i.imgur.com/a b.png", "https://i.imgur.com/" + strings.Repeat("a", 1500),
	} {
		if validImageURL(value) {
			t.Errorf("invalid wallpaper accepted: %q", value)
		}
	}
	// Desks saved before wallpaperURL existed still load, with no custom image.
	path := filepath.Join(t.TempDir(), "desks.json")
	old := `{"version":1,"desks":[{"ownerHash":"` + hashToken(tokenA) + `","ownerName":"Ana","style":{"top":"oak","chairColor":"#25333e","lampColor":"#ffb86b","lampOn":true,"keyboardColor":"#fff0d3","wallpaper":"dawn","items":["none","none","none"],"plate":"Ana","mood":"","status":"available","poster":""},"notes":[]}]}`
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}
	if loaded := loadDesks(path); loaded[0] == nil || loaded[0].Style.WallpaperURL != "" {
		t.Fatal("a pre-wallpaperURL file should still load")
	}
}
