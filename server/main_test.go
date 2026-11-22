package main

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"
)

func TestGIFURLPolicy(t *testing.T) {
	for _, value := range []string{
		"https://media.tenor.com/example/reaction.gif",
		"https://media.tenor.com:443/example/reaction.gif",
		"https://media2.giphy.com/media/example/giphy.GIF",
		"https://cdn.discordapp.com/attachments/123/456/reaction.gif?ex=123&hm=456",
		"https://media.discordapp.net/attachments/123/456/reaction.gif?width=200",
	} {
		if !validGIFURL(value) {
			t.Errorf("valid link rejected: %q", value)
		}
	}
	for _, value := range []string{
		"", "not a URL", "http://media.tenor.com/a.gif", "javascript:alert(1)",
		"data:image/gif;base64,R0lG", "https://tenor.com/view/example",
		"https://giphy.com/gifs/example", "https://localhost/a.gif",
		"https://127.0.0.1/a.gif", "https://media.tenor.com.evil.test/a.gif",
		"https://evil.test/media.tenor.com/a.gif", "https://user@media.tenor.com/a.gif",
		"https://media.tenor.com:8443/a.gif", "https://media.tenor.com/a.svg",
		"https://media.tenor.com/a.gif#fragment", " https://media.tenor.com/a.gif",
		"https://media.tenor.com/a.gif?q=" + strings.Repeat("a", 1500),
	} {
		if validGIFURL(value) {
			t.Errorf("invalid link accepted: %q", value)
		}
	}
}

func TestGIFIdentityBroadcastAndLimit(t *testing.T) {
	h := newHub()
	sender := &peer{joined: true, send: make(chan []byte, 8), player: player{ID: "sender"}}
	viewer := &peer{joined: true, send: make(chan []byte, 8), player: player{ID: "viewer"}}
	h.peers[sender], h.peers[viewer] = true, true
	now := time.Now()
	link := "https://media.tenor.com/example/reaction.gif"
	send := func(url string, at time.Time) {
		h.handle(command{peer: sender, input: input{Type: "gif", Name: "spoof", URL: url}}, at)
	}
	send("https://evil.test/a.gif", now)
	if len(sender.send) != 0 || !sender.lastGIF.IsZero() {
		t.Fatal("invalid GIF must not broadcast or consume the rate limit")
	}
	send(link, now)
	for _, p := range []*peer{sender, viewer} {
		var got map[string]string
		if err := json.Unmarshal(<-p.send, &got); err != nil {
			t.Fatal(err)
		}
		if got["type"] != "gif" || got["id"] != "sender" || got["url"] != link || len(got) != 3 {
			t.Fatalf("unexpected GIF broadcast: %v", got)
		}
	}
	send(link, now.Add(time.Second))
	if len(sender.send) != 0 || len(viewer.send) != 0 {
		t.Fatal("GIF rate limit not applied")
	}
	send(link, now.Add(2*time.Second))
	if len(sender.send) != 1 || len(viewer.send) != 1 {
		t.Fatal("GIF should be accepted after cooldown")
	}
}

func TestMovementBoundary(t *testing.T) {
	now := time.Now()
	p := &peer{lastMove: now.Add(-50 * time.Millisecond)}
	for _, tc := range []struct {
		name string
		move input
		want bool
	}{
		{"walking", input{X: 0.2}, true},
		{"teleport", input{X: 4}, false},
		{"outside", input{Z: 24}, false},
		{"non finite", input{X: math.NaN()}, false},
		{"jump and punch upper bounds", input{Y: 3.5, Punch: 0.32}, true},
		{"negative height", input{Y: -0.01}, false},
		{"height above limit", input{Y: 3.51}, false},
		{"height NaN", input{Y: math.NaN()}, false},
		{"height positive infinity", input{Y: math.Inf(1)}, false},
		{"height negative infinity", input{Y: math.Inf(-1)}, false},
		{"negative punch", input{Punch: -0.01}, false},
		{"punch above limit", input{Punch: 0.33}, false},
		{"punch NaN", input{Punch: math.NaN()}, false},
		{"punch positive infinity", input{Punch: math.Inf(1)}, false},
		{"punch negative infinity", input{Punch: math.Inf(-1)}, false},
		{"both arms upper bounds", input{Punch: 0.32, PunchLeft: 0.32}, true},
		{"left only", input{PunchLeft: 0.32}, true},
		{"negative left punch", input{PunchLeft: -0.01}, false},
		{"left punch above limit", input{PunchLeft: 0.33}, false},
		{"left punch NaN", input{PunchLeft: math.NaN()}, false},
		{"left punch positive infinity", input{PunchLeft: math.Inf(1)}, false},
		{"left punch negative infinity", input{PunchLeft: math.Inf(-1)}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := validMove(p, tc.move, now); got != tc.want {
				t.Fatalf("validMove = %v, want %v", got, tc.want)
			}
		})
	}
	p.lastMove = now.Add(-time.Hour)
	if validMove(p, input{X: 8}, now) {
		t.Fatal("idle time must not permit teleport")
	}
}

func TestJumpAndPunchStorageAndCorrection(t *testing.T) {
	h := newHub()
	now := time.Now()
	p := &peer{
		joined: true, send: make(chan []byte, 8),
		player: player{ID: "jumper"}, lastMove: now.Add(-50 * time.Millisecond),
	}
	h.peers[p] = true
	h.handle(command{peer: p, input: input{Type: "move", Y: 0.8, Punch: 0.24, PunchLeft: 0.16}}, now)
	if p.player.Y != 0.8 || p.player.Punch != 0.24 || p.player.PunchLeft != 0.16 {
		t.Fatalf("jump and punch not stored: %+v", p.player)
	}
	if got := h.players(); len(got) != 1 || got[0].Y != 0.8 || got[0].Punch != 0.24 || got[0].PunchLeft != 0.16 {
		t.Fatalf("snapshot state lost jump or punch: %+v", got)
	}
	accepted := p.player
	for i, move := range []input{
		{Type: "move", Y: 3.6},
		{Type: "move", Punch: 0.33},
		{Type: "move", PunchLeft: 0.33},
	} {
		h.handle(command{peer: p, input: move}, now.Add(time.Duration(i+1)*50*time.Millisecond))
		if p.player != accepted {
			t.Fatalf("invalid move changed accepted state: %+v", p.player)
		}
		var correction struct {
			Type   string `json:"type"`
			Player player `json:"player"`
		}
		select {
		case data := <-p.send:
			if err := json.Unmarshal(data, &correction); err != nil {
				t.Fatal(err)
			}
		default:
			t.Fatal("invalid move did not send correction")
		}
		if correction.Type != "correction" || correction.Player != accepted {
			t.Fatalf("unexpected correction: %+v", correction)
		}
	}
	var legacy input
	if err := json.Unmarshal([]byte(`{"type":"move","x":0,"z":0,"rotation":0,"animation":"idle"}`), &legacy); err != nil {
		t.Fatal(err)
	}
	h.handle(command{peer: p, input: legacy}, now.Add(200*time.Millisecond))
	if p.player.Y != 0 || p.player.Punch != 0 || p.player.PunchLeft != 0 {
		t.Fatalf("omitted fields must default to zero: %+v", p.player)
	}
	if err := json.Unmarshal([]byte(`{"type":"move","punch":0.2}`), &legacy); err != nil {
		t.Fatal(err)
	}
	h.handle(command{peer: p, input: legacy}, now.Add(250*time.Millisecond))
	if p.player.Punch != 0.2 || p.player.PunchLeft != 0 {
		t.Fatalf("legacy punch must remain right-arm only: %+v", p.player)
	}
}

func TestMoveAnimationValues(t *testing.T) {
	h := newHub()
	now := time.Now()
	p := &peer{
		joined: true, send: make(chan []byte, 8),
		player: player{ID: "sitter"}, lastMove: now.Add(-50 * time.Millisecond),
	}
	h.peers[p] = true
	for i, tc := range []struct{ sent, want string }{
		{"sit", "sit"}, {"walk", "walk"}, {"idle", "idle"}, {"dance", "idle"}, {"", "idle"},
	} {
		h.handle(command{peer: p, input: input{Type: "move", Animation: tc.sent}}, now.Add(time.Duration(i)*50*time.Millisecond))
		if got := h.players()[0].Animation; got != tc.want {
			t.Fatalf("animation %q: got %q, want %q", tc.sent, got, tc.want)
		}
	}
}

func TestGardenMovementBoundary(t *testing.T) {
	now := time.Now()
	p := &peer{lastMove: now.Add(-50 * time.Millisecond), player: player{X: 23.3, Z: 15}}
	if !validMove(p, input{X: 23.5, Z: 15}, now) {
		t.Fatal("walking inside the expanded garden bounds should be allowed")
	}
	if validMove(p, input{X: 23.51, Z: 15}, now) {
		t.Fatal("walking outside the expanded garden bounds should be rejected")
	}
	p.player.X = -23.3
	if !validMove(p, input{X: -23.5, Z: 15}, now) {
		t.Fatal("negative garden boundary should be allowed")
	}
	if validMove(p, input{X: -23.51, Z: 15}, now) {
		t.Fatal("negative garden boundary should be enforced")
	}
	p.player.X, p.player.Z = 15, 23.3
	if !validMove(p, input{X: 15, Z: 23.5, Y: 3.5, Punch: 0.32}, now) {
		t.Fatal("positive Z boundary must preserve valid jump and punch fields")
	}
	if validMove(p, input{X: 15, Z: 23.51}, now) {
		t.Fatal("positive Z garden boundary should be enforced")
	}
	p.player.Z = -23.3
	if !validMove(p, input{X: 15, Z: -23.5}, now) {
		t.Fatal("negative Z garden boundary should be allowed")
	}
	if validMove(p, input{X: 15, Z: -23.51}, now) {
		t.Fatal("negative Z garden boundary should be enforced")
	}
	if validMove(p, input{X: 15, Z: -23.5, Y: 3.51}, now) {
		t.Fatal("expanded horizontal bounds must not raise the feet height cap")
	}
}

func TestChatIdentityAndLimit(t *testing.T) {
	h := newHub()
	p := &peer{
		joined: true, send: make(chan []byte, 8),
		player: player{ID: "actual-id", Name: "Ana"},
	}
	h.peers[p] = true
	viewer := &peer{
		joined: true, send: make(chan []byte, 8),
		player: player{ID: "viewer"},
	}
	h.peers[viewer] = true
	now := time.Now()
	h.handle(command{peer: p, input: input{Type: "chat", Name: "spoof", Text: "hi"}}, now)
	got := string(<-p.send)
	if got != `{"at":"`+now.UTC().Format(time.RFC3339)+`","id":"actual-id","name":"Ana","text":"hi","type":"chat"}` {
		t.Fatalf("unexpected chat: %s", got)
	}
	select {
	case data := <-viewer.send:
		if string(data) != got {
			t.Fatalf("room viewer received different chat: %s", data)
		}
	default:
		t.Fatal("chat must broadcast to other room members")
	}
	h.handle(command{peer: p, input: input{Type: "chat", Text: "spam"}}, now)
	if len(p.send) != 0 || len(viewer.send) != 0 {
		t.Fatal("chat rate limit not applied")
	}
	if clean("  Hey👋\n  ", 4) != "Hey👋" {
		t.Fatal("unicode trimming failed")
	}
}

func signalPeers() (*hub, *peer, *peer, *peer) {
	h := newHub()
	peers := make([]*peer, 3)
	for i, id := range []string{"sender", "target", "bystander"} {
		peers[i] = &peer{
			joined: true, send: make(chan []byte, 128),
			player: player{ID: id, Voice: true},
		}
		h.peers[peers[i]] = true
	}
	return h, peers[0], peers[1], peers[2]
}

func TestVoiceConsentAndReconnect(t *testing.T) {
	h := newHub()
	now := time.Now()
	p := &peer{send: make(chan []byte, 16), player: player{ID: "first", Voice: true}}
	h.handle(command{peer: p, input: input{Type: "join", Name: "Ana"}}, now)
	if p.player.Voice {
		t.Fatal("join must start with voice disabled")
	}
	for _, enabled := range []bool{true, false, true} {
		h.handle(command{peer: p, input: input{Type: "voice", Enabled: &enabled}}, now)
		if p.player.Voice != enabled || h.players()[0].Voice != enabled {
			t.Fatal("voice consent not reflected in snapshot state")
		}
	}
	h.handle(command{peer: p, input: input{Type: "voice"}}, now)
	if !p.player.Voice {
		t.Fatal("missing enabled must not change consent")
	}
	h.handle(command{peer: p, leave: true}, now)
	fresh := &peer{send: make(chan []byte, 16), player: player{ID: "new"}}
	h.handle(command{peer: fresh, input: input{Type: "join"}}, now)
	if len(h.players()) != 1 || fresh.player.Voice {
		t.Fatal("reconnection must not inherit consent")
	}
	h.handle(command{peer: p, input: input{Type: "signal", To: "new", Kind: "ice", Data: json.RawMessage("null")}}, now)
	if len(fresh.send) != 2 {
		t.Fatal("departed sender must not route signals")
	}
}

func TestSignalTargetAndIdentity(t *testing.T) {
	for _, payload := range []string{
		`{"type":"signal","from":"spoofed","to":"target","kind":"offer","data":{"type":"offer","sdp":"v=0\r\n"}}`,
		`{"type":"signal","to":"target","kind":"answer","data":{"type":"answer","sdp":"v=0\r\n"}}`,
		`{"type":"signal","to":"target","kind":"ice","data":{"candidate":"candidate:1","sdpMid":"0","sdpMLineIndex":0,"usernameFragment":"abc"}}`,
		`{"type":"signal","to":"target","kind":"ice","data":null}`,
	} {
		t.Run(payload, func(t *testing.T) {
			h, sender, target, bystander := signalPeers()
			var m input
			if err := json.Unmarshal([]byte(payload), &m); err != nil {
				t.Fatal(err)
			}
			h.handle(command{peer: sender, input: m}, time.Now())
			if len(target.send) != 1 || len(sender.send) != 0 || len(bystander.send) != 0 {
				t.Fatal("signal must only reach target")
			}
			var got struct {
				Type string          `json:"type"`
				From string          `json:"from"`
				Kind string          `json:"kind"`
				Data json.RawMessage `json:"data"`
			}
			if err := json.Unmarshal(<-target.send, &got); err != nil {
				t.Fatal(err)
			}
			if got.Type != "signal" || got.From != "sender" || got.Kind != m.Kind || string(got.Data) != string(m.Data) {
				t.Fatalf("incorrect signal envelope: %+v", got)
			}
		})
	}
}

func TestSignalRejectsInvalidRoutesAndConsent(t *testing.T) {
	for _, scenario := range []string{"sender disabled", "target disabled", "self", "missing target", "left target", "left sender"} {
		t.Run(scenario, func(t *testing.T) {
			h, sender, target, bystander := signalPeers()
			m := input{Type: "signal", To: "target", Kind: "ice", Data: json.RawMessage("null")}
			switch scenario {
			case "sender disabled":
				sender.player.Voice = false
			case "target disabled":
				target.player.Voice = false
			case "self":
				m.To = "sender"
			case "missing target":
				m.To = "absent"
			case "left target":
				delete(h.peers, target)
			case "left sender":
				delete(h.peers, sender)
			}
			h.handle(command{peer: sender, input: m}, time.Now())
			if len(sender.send)+len(target.send)+len(bystander.send) != 0 {
				t.Fatal("invalid route must be silently ignored")
			}
		})
	}
}

func TestSignalValidation(t *testing.T) {
	for _, tc := range []struct {
		name, kind, data string
		want             bool
	}{
		{"offer boundary", "offer", `{"type":"offer","sdp":"` + strings.Repeat("s", 16000) + `"}`, true},
		{"offer oversized", "offer", `{"type":"offer","sdp":"` + strings.Repeat("s", 16001) + `"}`, false},
		{"answer boundary", "answer", `{"type":"answer","sdp":"` + strings.Repeat("s", 16000) + `"}`, true},
		{"answer oversized", "answer", `{"type":"answer","sdp":"` + strings.Repeat("s", 16001) + `"}`, false},
		{"mismatched description", "offer", `{"type":"answer","sdp":"v=0"}`, false},
		{"missing description", "offer", `{"type":"offer"}`, false},
		{"null description", "offer", `{"type":"offer","sdp":null}`, false},
		{"non-string description", "answer", `{"type":"answer","sdp":42}`, false},
		{"unknown description field", "offer", `{"type":"offer","sdp":"","extra":true}`, false},
		{"candidate boundary", "ice", `{"candidate":"` + strings.Repeat("c", 4096) + `"}`, true},
		{"candidate oversized", "ice", `{"candidate":"` + strings.Repeat("c", 4097) + `"}`, false},
		{"empty candidate", "ice", `{"candidate":""}`, true},
		{"null marker", "ice", `null`, true},
		{"nullable fields", "ice", `{"candidate":"c","sdpMid":null,"sdpMLineIndex":null,"usernameFragment":null}`, true},
		{"missing candidate", "ice", `{}`, false},
		{"null candidate", "ice", `{"candidate":null}`, false},
		{"non-string candidate", "ice", `{"candidate":1}`, false},
		{"bad mid", "ice", `{"candidate":"c","sdpMid":1}`, false},
		{"oversized mid", "ice", `{"candidate":"c","sdpMid":"` + strings.Repeat("m", 257) + `"}`, false},
		{"oversized username", "ice", `{"candidate":"c","usernameFragment":"` + strings.Repeat("u", 257) + `"}`, false},
		{"negative index", "ice", `{"candidate":"c","sdpMLineIndex":-1}`, false},
		{"fractional index", "ice", `{"candidate":"c","sdpMLineIndex":0.5}`, false},
		{"oversized index", "ice", `{"candidate":"c","sdpMLineIndex":65536}`, false},
		{"unknown candidate field", "ice", `{"candidate":"c","extra":true}`, false},
		{"unknown kind", "rollback", `null`, false},
		{"null offer", "offer", `null`, false},
		{"array", "ice", `[]`, false},
		{"string", "ice", `"candidate"`, false},
		{"missing data", "ice", ``, false},
		{"broken JSON", "offer", `{`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := validSignal(tc.kind, json.RawMessage(tc.data)); got != tc.want {
				t.Fatalf("validSignal = %v, want %v", got, tc.want)
			}
			if !tc.want {
				h, sender, target, _ := signalPeers()
				h.handle(command{peer: sender, input: input{
					Type: "signal", To: "target", Kind: tc.kind, Data: json.RawMessage(tc.data),
				}}, time.Now())
				if len(target.send) != 0 {
					t.Fatal("malformed signal was routed")
				}
			}
		})
	}
}

func TestSignalRateLimit(t *testing.T) {
	h, sender, target, bystander := signalPeers()
	now := time.Now()
	m := input{Type: "signal", To: "target", Kind: "ice", Data: json.RawMessage("null")}
	for i := 0; i < 81; i++ {
		h.handle(command{peer: sender, input: m}, now)
	}
	if len(target.send) != 80 {
		t.Fatalf("accepted %d signals, want 80", len(target.send))
	}
	m.To = "sender"
	h.handle(command{peer: bystander, input: m}, now)
	if len(sender.send) != 1 {
		t.Fatal("rate limit must be per sender")
	}
	m.To = "target"
	h.handle(command{peer: sender, input: m}, now.Add(time.Second))
	if len(target.send) != 81 {
		t.Fatal("signal window must reset after one second")
	}
}
