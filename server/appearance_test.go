package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestAppearanceValidation(t *testing.T) {
	good := defaultAppearance("#72baff")
	raw, _ := json.Marshal(good)
	if got, ok := parseAppearance(raw); !ok || got != good {
		t.Fatal("default appearance must round-trip")
	}
	for _, key := range []string{"top", "bottom", "shoes", "topColor", "bottomColor", "shoeColor", "skin", "hair", "hairColor", "hat", "hatColor", "backpack", "backpackColor", "face"} {
		t.Run(key, func(t *testing.T) {
			var fields map[string]any
			json.Unmarshal(raw, &fields)
			delete(fields, key)
			missing, _ := json.Marshal(fields)
			if _, ok := parseAppearance(missing); ok {
				t.Fatal("missing field accepted")
			}
			fields[key] = "invalid"
			invalid, _ := json.Marshal(fields)
			if _, ok := parseAppearance(invalid); ok {
				t.Fatal("invalid field accepted")
			}
			fields[key] = nil
			null, _ := json.Marshal(fields)
			if _, ok := parseAppearance(null); ok {
				t.Fatal("null field accepted")
			}
		})
	}
	for _, raw := range []string{`null`, `{}`, `[]`, `{"top":"tee"}`} {
		if _, ok := parseAppearance(json.RawMessage(raw)); ok {
			t.Fatalf("malformed appearance accepted: %s", raw)
		}
	}
	var fields map[string]any
	json.Unmarshal(raw, &fields)
	fields["extra"] = "not allowed"
	unknown, _ := json.Marshal(fields)
	if _, ok := parseAppearance(unknown); ok {
		t.Fatal("unknown field accepted")
	}
}

func TestAppearanceJoinAndLiveBroadcast(t *testing.T) {
	h := newHub()
	now := time.Now()
	a := &peer{player: player{ID: "a", Color: "#72baff"}, send: make(chan []byte, 16)}
	h.handle(command{peer: a, input: input{Type: "join", Name: "Ana"}}, now)
	if a.player.Appearance != defaultAppearance("#72baff") {
		t.Fatal("legacy join must receive a full default appearance")
	}
	b := &peer{joined: true, player: player{ID: "b"}, send: make(chan []byte, 16)}
	h.peers[b] = true
	selected := defaultAppearance("#ff7c9a")
	selected.Top, selected.Hat, selected.Backpack = "hoodie", "cap", false
	raw, _ := json.Marshal(selected)
	h.handle(command{peer: a, input: input{Type: "appearance", Name: "spoof", Appearance: raw}}, now)
	if a.player.Appearance != selected || a.player.Color != selected.TopColor || a.player.ID != "a" || a.player.Name != "Ana" {
		t.Fatal("appearance must change without changing server-owned identity")
	}
	var snapshot struct {
		Type    string
		Players []player
	}
	if err := json.Unmarshal(<-b.send, &snapshot); err != nil || snapshot.Type != "snapshot" {
		t.Fatal("appearance must immediately broadcast a snapshot")
	}
	found := false
	for _, p := range snapshot.Players {
		if p.ID == "a" && p.Appearance == selected {
			found = true
		}
	}
	if !found {
		t.Fatal("viewer did not receive the selected appearance")
	}
	h.handle(command{peer: a, input: input{Type: "appearance", Appearance: json.RawMessage(`{}`)}}, now)
	if a.player.Appearance != selected || len(b.send) != 0 {
		t.Fatal("invalid updates must leave appearance unchanged")
	}
	c := &peer{player: player{ID: "c"}, send: make(chan []byte, 16)}
	h.handle(command{peer: c, input: input{Type: "join", Name: "Custom", Appearance: raw}}, now)
	if c.player.Appearance != selected {
		t.Fatal("join must accept a valid complete selection")
	}
}
