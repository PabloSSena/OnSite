package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestWebcamSignaling(t *testing.T) {
	h := newHub()
	a := &peer{joined: true, player: player{ID: "a"}, send: make(chan []byte, 64)}
	b := &peer{joined: true, player: player{ID: "b"}, send: make(chan []byte, 64)}
	c := &peer{joined: true, player: player{ID: "c"}, send: make(chan []byte, 64)}
	h.peers[a], h.peers[b], h.peers[c] = true, true, true
	now := time.Now()
	offer := input{Type: "signal", To: "b", Session: "session-1", Kind: "offer", SDP: "test-sdp"}
	h.handle(command{peer: a, input: offer}, now)
	if len(b.send) != 0 {
		t.Fatal("camera-off players must not send offers")
	}
	h.handle(command{peer: a, input: input{Type: "camera", Enabled: true}}, now)
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
	if signal["from"] != "a" || signal["session"] != offer.Session || signal["sdp"] != offer.SDP {
		t.Fatalf("unexpected signal: %v", signal)
	}
	if len(a.send) != 0 || len(c.send) != 0 {
		t.Fatal("signaling must only reach the target")
	}
	for _, invalid := range []input{
		{Type: "signal", To: "b", Session: "s", Kind: "unknown", SDP: "sdp"},
		{Type: "signal", To: "b", Session: "s", Kind: "offer", SDP: strings.Repeat("x", 16385)},
		{Type: "signal", To: "b", Kind: "offer", SDP: "sdp"},
		{Type: "signal", To: "missing", Session: "s", Kind: "offer", SDP: "sdp"},
		{Type: "signal", To: "a", Session: "s", Kind: "offer", SDP: "sdp"},
	} {
		h.handle(command{peer: a, input: invalid}, now)
	}
	if len(a.send) != 0 || len(b.send) != 0 || len(c.send) != 0 {
		t.Fatal("invalid signals must be dropped")
	}
	a.signalStart, a.signalCount = now, 40
	h.handle(command{peer: a, input: offer}, now)
	if len(b.send) != 0 {
		t.Fatal("signaling must be rate limited")
	}
	answer := input{Type: "signal", To: "a", Session: "session-1", Kind: "answer", SDP: "answer-sdp"}
	h.handle(command{peer: b, input: answer}, now)
	if len(a.send) != 1 {
		t.Fatal("viewers without cameras must be able to answer")
	}
	<-a.send
	h.handle(command{peer: a, input: input{Type: "camera", Enabled: false}}, now)
	for _, p := range []*peer{a, b, c} {
		<-p.send
	}
	h.handle(command{peer: b, input: answer}, now)
	if len(a.send) != 0 {
		t.Fatal("answers must not be relayed to camera-off players")
	}
}
