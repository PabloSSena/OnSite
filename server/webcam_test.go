package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func boolPointer(value bool) *bool { return &value }

func TestWebcamSignaling(t *testing.T) {
	h := newHub()
	a := &peer{joined: true, player: player{ID: "a"}, send: make(chan []byte, 64)}
	b := &peer{joined: true, player: player{ID: "b"}, send: make(chan []byte, 64)}
	c := &peer{joined: true, player: player{ID: "c"}, send: make(chan []byte, 64)}
	h.peers[a], h.peers[b], h.peers[c] = true, true, true
	now := time.Now()
	offer := input{Type: "camera-signal", To: "b", Session: "session-1", Kind: "offer", SDP: "test-sdp"}
	h.handle(command{peer: a, input: offer}, now)
	if len(b.send) != 0 {
		t.Fatal("camera-off players must not send offers")
	}
	h.handle(command{peer: a, input: input{Type: "camera", Enabled: boolPointer(true)}}, now)
	for _, p := range []*peer{a, b, c} {
		var snapshot struct {
			Type    string
			Players []player
		}
		if err := json.Unmarshal(<-p.send, &snapshot); err != nil {
			t.Fatal(err)
		}
		found := false
		for _, player := range snapshot.Players {
			if player.ID == "a" && player.Camera {
				found = true
			}
		}
		if snapshot.Type != "snapshot" || !found {
			t.Fatal("camera state must be broadcast immediately")
		}
	}
	h.handle(command{peer: a, input: offer}, now)
	var signal map[string]string
	if err := json.Unmarshal(<-b.send, &signal); err != nil {
		t.Fatal(err)
	}
	if signal["type"] != "camera-signal" || signal["from"] != "a" || signal["session"] != offer.Session || signal["sdp"] != offer.SDP {
		t.Fatalf("unexpected signal: %v", signal)
	}
	if len(a.send) != 0 || len(c.send) != 0 {
		t.Fatal("signaling must only reach the target")
	}
	for _, invalid := range []input{
		{Type: "camera-signal", To: "b", Session: "s", Kind: "unknown", SDP: "sdp"},
		{Type: "camera-signal", To: "b", Session: "s", Kind: "offer", SDP: strings.Repeat("x", 16385)},
		{Type: "camera-signal", To: "b", Session: strings.Repeat("s", 65), Kind: "offer", SDP: "sdp"},
		{Type: "camera-signal", To: "b", Kind: "offer", SDP: "sdp"},
		{Type: "camera-signal", To: "b", Session: "s", Kind: "offer"},
		{Type: "camera-signal", To: "missing", Session: "s", Kind: "offer", SDP: "sdp"},
		{Type: "camera-signal", To: "a", Session: "s", Kind: "offer", SDP: "sdp"},
	} {
		h.handle(command{peer: a, input: invalid}, now)
	}
	if len(a.send) != 0 || len(b.send) != 0 || len(c.send) != 0 {
		t.Fatal("invalid signals must be dropped")
	}
	a.cameraSignalStart, a.cameraSignalCount = now, 40
	h.handle(command{peer: a, input: offer}, now)
	if len(b.send) != 0 {
		t.Fatal("signaling must be rate limited")
	}
	answer := input{Type: "camera-signal", To: "a", Session: "session-1", Kind: "answer", SDP: "answer-sdp"}
	h.handle(command{peer: b, input: answer}, now)
	if len(a.send) != 1 {
		t.Fatal("viewers without cameras must be able to answer")
	}
	<-a.send
	h.handle(command{peer: a, input: input{Type: "camera", Enabled: boolPointer(false)}}, now)
	for _, p := range []*peer{a, b, c} {
		<-p.send
	}
	h.handle(command{peer: b, input: answer}, now)
	if len(a.send) != 0 {
		t.Fatal("answers must not be relayed to camera-off players")
	}
}

func TestMediaSignalNamespacesAndIndependentLimits(t *testing.T) {
	h, sender, target, bystander := signalPeers()
	sender.player.Camera = true
	now := time.Now()
	voice := input{Type: "signal", To: "target", Kind: "offer", Data: json.RawMessage(`{"type":"offer","sdp":"voice-sdp"}`)}
	camera := input{Type: "camera-signal", To: "target", Session: "camera-session", Kind: "offer", SDP: "camera-sdp"}

	// The other media's payload must not pass validation just by changing its type.
	wrongVoice, wrongCamera := camera, voice
	wrongVoice.Type, wrongCamera.Type = "signal", "camera-signal"
	h.handle(command{peer: sender, input: wrongVoice}, now)
	h.handle(command{peer: sender, input: wrongCamera}, now)
	if len(target.send) != 0 {
		t.Fatal("media payloads must not cross-route between namespaces")
	}

	assertRelay := func(message input) {
		t.Helper()
		h.handle(command{peer: sender, input: message}, now)
		select {
		case data := <-target.send:
			var got map[string]json.RawMessage
			if err := json.Unmarshal(data, &got); err != nil {
				t.Fatal(err)
			}
			var kind string
			if err := json.Unmarshal(got["type"], &kind); err != nil || kind != message.Type {
				t.Fatalf("incorrect namespace: %s", data)
			}
			if message.Type == "signal" && (got["sdp"] != nil || got["session"] != nil) {
				t.Fatalf("camera fields leaked into voice signal: %s", data)
			}
			if message.Type == "camera-signal" && got["data"] != nil {
				t.Fatalf("voice fields leaked into camera signal: %s", data)
			}
		default:
			t.Fatalf("%s unexpectedly blocked by other media limit", message.Type)
		}
	}
	sender.cameraSignalStart, sender.cameraSignalCount = now, 40
	assertRelay(voice)
	h.handle(command{peer: sender, input: camera}, now)
	if len(target.send) != 0 {
		t.Fatal("camera limit must still block camera signals")
	}
	sender.signalWindow, sender.signalCount = now, 80
	sender.cameraSignalStart, sender.cameraSignalCount = now, 0
	assertRelay(camera)
	h.handle(command{peer: sender, input: voice}, now)
	if len(target.send) != 0 || len(sender.send) != 0 || len(bystander.send) != 0 {
		t.Fatal("voice limit or target-only routing failed")
	}
	now = now.Add(time.Second)
	assertRelay(voice)
	assertRelay(camera)
}

func TestCameraConsentAndDepartedRoutes(t *testing.T) {
	h, sender, target, _ := signalPeers()
	now := time.Now()
	sender.player.Camera = true
	h.handle(command{peer: sender, input: input{Type: "camera"}}, now)
	if !sender.player.Camera || len(target.send) != 0 {
		t.Fatal("missing camera consent must not change state or broadcast")
	}
	for _, departed := range []*peer{sender, target} {
		delete(h.peers, departed)
		h.handle(command{peer: sender, input: input{
			Type: "camera-signal", To: "target", Session: "s", Kind: "offer", SDP: "sdp",
		}}, now)
		if len(target.send) != 0 {
			t.Fatal("departed peers must not exchange camera signals")
		}
		h.peers[departed] = true
	}
	fresh := &peer{send: make(chan []byte, 8), player: player{ID: "fresh", Camera: true}}
	h.handle(command{peer: fresh, input: input{Type: "join"}}, now)
	if fresh.player.Camera {
		t.Fatal("join must reset camera consent")
	}
}
