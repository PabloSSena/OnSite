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
		{"outside", input{Z: 10}, false},
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
