package main

import (
	"math"
	"testing"
	"time"
)

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
}

func TestChatIdentityAndLimit(t *testing.T) {
	h := newHub()
	p := &peer{
		joined: true, send: make(chan []byte, 8),
		player: player{ID: "actual-id", Name: "Ana"},
	}
	h.peers[p] = true
	now := time.Now()
	h.handle(command{peer: p, input: input{Type: "chat", Name: "spoof", Text: "hi"}}, now)
	got := string(<-p.send)
	if got != `{"at":"`+now.UTC().Format(time.RFC3339)+`","id":"actual-id","name":"Ana","text":"hi","type":"chat"}` {
		t.Fatalf("unexpected chat: %s", got)
	}
	h.handle(command{peer: p, input: input{Type: "chat", Text: "spam"}}, now)
	if len(p.send) != 0 {
		t.Fatal("chat rate limit not applied")
	}
	if clean("  Hey👋\n  ", 4) != "Hey👋" {
		t.Fatal("unicode trimming failed")
	}
}
