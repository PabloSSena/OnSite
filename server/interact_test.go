package main

import (
	"encoding/json"
	"math"
	"testing"
	"time"
)

func lastMessage(t *testing.T, p *peer) map[string]any {
	t.Helper()
	var last []byte
	for {
		select {
		case payload := <-p.send:
			last = payload
			continue
		default:
		}
		break
	}
	if last == nil {
		t.Fatal("expected a message")
	}
	var msg map[string]any
	if err := json.Unmarshal(last, &msg); err != nil {
		t.Fatal(err)
	}
	return msg
}

func fridgePeer(id string, x, z float64) *peer {
	return &peer{joined: true, player: player{ID: id, X: x, Z: z, Holding: "none"}, send: make(chan []byte, 64)}
}

func TestFridgeReachAndBeer(t *testing.T) {
	now := time.Now()
	h := newHub()
	near, far := fridgePeer("near", 13, -2.8), fridgePeer("far", 0, 6)
	h.peers[near], h.peers[far] = true, true
	interact := func(p *peer, action string, at time.Time) {
		h.handle(command{peer: p, input: input{Type: "interact", Action: action}}, at)
	}

	interact(far, "toggle-fridge", now)
	if h.fridgeOpen {
		t.Fatal("a player out of reach must not open the fridge")
	}
	interact(near, "take-beer", now)
	if near.player.Holding != "none" {
		t.Fatal("a closed fridge must not hand out beer")
	}
	interact(near, "toggle-fridge", now)
	if !h.fridgeOpen {
		t.Fatal("a player in reach opens the fridge")
	}
	world, _ := lastMessage(t, far)["world"].(map[string]any)
	if world["fridgeOpen"] != true {
		t.Fatal("the open door must be broadcast to everyone")
	}
	interact(near, "take-beer", now.Add(100*time.Millisecond))
	if near.player.Holding != "none" {
		t.Fatal("interactions faster than 250 ms are ignored")
	}
	interact(near, "take-beer", now.Add(300*time.Millisecond))
	if near.player.Holding != "beer" {
		t.Fatal("an open fridge in reach gives a beer")
	}
	interact(far, "take-beer", now.Add(300*time.Millisecond))
	if far.player.Holding != "none" {
		t.Fatal("a player out of reach must not take a beer")
	}
	interact(near, "drop", now.Add(600*time.Millisecond))
	if near.player.Holding != "none" {
		t.Fatal("drop empties the hands")
	}
}

func TestDrinkRequiresBeerAndRange(t *testing.T) {
	now := time.Now()
	p := fridgePeer("drinker", 0, 0)
	for _, drink := range []float64{-0.1, 1.21, math.NaN(), math.Inf(1)} {
		if validMove(p, input{Drink: drink}, now) {
			t.Fatalf("invalid drink accepted: %v", drink)
		}
	}
	h := newHub()
	h.peers[p] = true
	h.handle(command{peer: p, input: input{Type: "move", Drink: 1}}, now)
	if p.player.Drink != 0 {
		t.Fatal("empty hands must not animate drinking")
	}
	p.player.Holding = "beer"
	h.handle(command{peer: p, input: input{Type: "move", Drink: 0.8}}, now.Add(time.Second))
	if p.player.Drink != 0.8 {
		t.Fatal("a held beer synchronizes the sip")
	}
}

func TestFridgeResetsAndJoinState(t *testing.T) {
	now := time.Now()
	h := newHub()
	p := fridgePeer("first", 13, -2.8)
	h.peers[p] = true
	h.fridgeOpen = true

	joiner := &peer{player: player{ID: "joiner", Holding: "beer", Drink: 1}, send: make(chan []byte, 16)}
	h.handle(command{peer: joiner, input: input{Type: "join", Name: "Ana"}}, now)
	if joiner.player.Holding != "none" || joiner.player.Drink != 0 {
		t.Fatal("joining (and reconnecting) starts with empty hands")
	}
	var welcome map[string]any
	json.Unmarshal(<-joiner.send, &welcome)
	if welcome["type"] != "welcome" || welcome["world"].(map[string]any)["fridgeOpen"] != true {
		t.Fatal("welcome must carry the current door state")
	}

	h.handle(command{peer: joiner, leave: true}, now)
	if !h.fridgeOpen {
		t.Fatal("the door stays open while someone is in the room")
	}
	h.handle(command{peer: p, leave: true}, now)
	if h.fridgeOpen {
		t.Fatal("an empty room closes the fridge")
	}
}
