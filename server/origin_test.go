package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestWebSocketOrigins(t *testing.T) {
	for _, tc := range []struct {
		name    string
		allowed []string
		origin  string
		want    bool
	}{
		{"same origin by default", nil, "", true},
		{"cross origin rejected by default", nil, "https://onsite-plum.vercel.app", false},
		{"configured frontend allowed", []string{"onsite-plum.vercel.app"}, "https://onsite-plum.vercel.app", true},
		{"unlisted frontend rejected", []string{"onsite-plum.vercel.app"}, "https://other.vercel.app", false},
		{"lookalike hostname rejected", []string{"onsite-plum.vercel.app"}, "https://onsite-plum.vercel.app.evil.test", false},
		{"same origin with allowlist", []string{"onsite-plum.vercel.app"}, "", true},
		{"custom frontend allowed", []string{"onsite-plum.vercel.app", "office.onsite.dev.br"}, "https://office.onsite.dev.br", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			h := newHub()
			h.allowedOrigins = tc.allowed
			go h.run(ctx)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				h.serve(ctx, w, r)
			}))
			defer server.Close()
			defer cancel()

			origin := tc.origin
			if origin == "" {
				origin = server.URL
			}
			dialCtx, stop := context.WithTimeout(ctx, 5*time.Second)
			defer stop()
			conn, response, err := websocket.Dial(dialCtx, "ws"+strings.TrimPrefix(server.URL, "http")+"/ws", &websocket.DialOptions{
				HTTPHeader: http.Header{"Origin": []string{origin}},
			})
			if conn != nil {
				defer conn.CloseNow()
			}
			if tc.want {
				if err != nil {
					t.Fatalf("allowed origin rejected: %v", err)
				}
			} else if err == nil || response == nil || response.StatusCode != http.StatusForbidden {
				t.Fatalf("expected 403 for rejected origin; response=%v err=%v", response, err)
			}
		})
	}
}
