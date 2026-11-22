package main

import (
	"encoding/json"
	"math"
	"testing"
	"time"
)

func TestSpeechLevelValidationAndConsent(t *testing.T) {
	now := time.Now()
	p := &peer{joined: true, player: player{ID: "speaker"}, send: make(chan []byte, 16)}
	for _, level := range []float64{-0.01, 1.01, math.NaN(), math.Inf(1), math.Inf(-1)} {
		if validMove(p, input{Speaking: level}, now) {
			t.Fatalf("invalid speech level accepted: %v", level)
		}
	}
	for _, level := range []float64{0, 0.5, 1} {
		if !validMove(p, input{Speaking: level}, now) {
			t.Fatalf("valid speech level rejected: %v", level)
		}
	}
	h := newHub()
	h.peers[p] = true
	h.handle(command{peer: p, input: input{Type: "move", Speaking: 1}}, now)
	if p.player.Speaking != 0 {
		t.Fatal("voice-off players must not animate speech")
	}
	p.player.Voice = true
	h.handle(command{peer: p, input: input{Type: "move", Speaking: 0.7}}, now.Add(time.Second))
	if p.player.Speaking != 0.7 {
		t.Fatal("voice-on speech level must be synchronized")
	}
	payload, _ := json.Marshal(h.players())
	var snapshot []player
	json.Unmarshal(payload, &snapshot)
	if len(snapshot) != 1 || snapshot[0].Speaking != 0.7 {
		t.Fatal("snapshot must carry the speech level")
	}
	p.lastMove = now.Add(-2 * time.Second)
	if h.players()[0].Speaking != 0 {
		t.Fatal("stale activity must not leave a mouth stuck open")
	}
	disabled := false
	h.handle(command{peer: p, input: input{Type: "voice", Enabled: &disabled}}, now.Add(2*time.Second))
	if p.player.Speaking != 0 {
		t.Fatal("leaving voice must reset speech immediately")
	}
}
