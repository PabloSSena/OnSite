# Protocol v0 (JSON / WebSocket)

One room, at most 10 players. Same-origin endpoint: `/ws`.
First message within 10 seconds: `{"type":"join","name":"Ana"}`.
The server assigns an ID and color; names have up to 24 characters. No authentication.

Client → server:
- `join`: `name`.
- `move`: `x`, `z`, `rotation` (radians around Y), `animation` (`idle` or `walk`), at 20 Hz. Optional `y` (height above the floor, 0–3.5) and `punch` (remaining animation seconds, 0–0.32) default to zero when omitted.
- `chat`: `text`, up to 300 characters. At most one accepted message every 400 ms.
- `voice`: `enabled` (boolean). Explicit opt-in; published through the next snapshot.
- `signal`: `to` (current player ID), `kind` (`offer`, `answer`, or `ice`), `data` (described below). Only relayed when both players have voice enabled and the target is a different player currently in the room.
- `gif`: `url`, at most 1500 bytes. At most one accepted reaction every 2 seconds.
  Direct HTTPS URLs with a `.gif` path only (query strings are allowed).
  Allowed hosts: `media.tenor.com`, `media.giphy.com`, `i.giphy.com`,
  `media0.giphy.com` through `media4.giphy.com`, `cdn.discordapp.com`, `media.discordapp.net`.
  Credentials, fragments, and nonstandard ports are rejected. Invalid/rate-limited inputs are ignored.

Server → client:
- `welcome`: `id`, `players` (initial state, including yourself).
- `join`: `player` (also sent to the joining player).
- `snapshot`: `players` (full state, 20 Hz).
- `leave`: `id`.
- `chat`: `id`, `name`, `text`, `at` (RFC3339 UTC). Broadcast to everyone, including the sender.
- `gif`: `id` (connection identity), `url`. Broadcast to everyone, including the sender.
  Clients show a camera-facing image above that player's head for 8 seconds after receipt;
  a new reaction replaces the previous one. Leaving/disconnecting clears reactions.
  Reactions are transient events, not included in snapshots or replayed to late joiners.
- `correction`: `player` (accepted position after an invalid movement).
- `signal`: `from` (server-assigned sender ID), `kind`, `data`. Sent only to the requested target; a client-supplied `from` is ignored.

`Player`: `{id, name, color, x, y, z, punch, rotation, animation, voice}`.
Spawn: `(x: 0, y: 0, z: 6)`, with `punch: 0` and `voice: false`. Y is height; avatars face -Z.
Snapshots replace the remote player map. Local movement is immediate; remote
avatars use exponential position smoothing and rotation slerp. There is no
timestamped snapshot buffer yet; adding one is a useful exercise for handling jitter.

The server checks map bounds, horizontal speed with tolerance, finite values, and the `y`/`punch` ranges above. Invalid moves return the existing accepted player state through `correction`.
Jump physics and punch timing are client-side; these fields synchronize visual state, not combat or authoritative vertical physics.
Furniture collision uses full 3D client-side bounds, including vertical contact; this is **not** an authoritative simulation.
Chat uses connection identity and renders text through React, never HTML.
GIFs load directly from external hosts in a bounded `<img>` with no referrer.
The server does not download, proxy, or verify image contents; failed loads show a fallback.
Media hosts see viewers' IP addresses. Links can expire, particularly Discord attachments.
The outgoing queue is bounded: slow clients are disconnected without blocking the hub.
Ping every 20s, 5s timeout. Reconnection creates a new identity and resets to spawn.
No persisted history; the latest 100 messages live only in the tab.
A full room or invalid handshake closes the connection; the UI retries until the user leaves.

## Opt-in WebRTC signaling

Offer/answer `data` is `{type: "offer" | "answer", sdp: string}`, with `type` matching `kind` and SDP at most 16,000 UTF-8 bytes. ICE `data` is either `null` (end of candidates) or `{candidate: string, sdpMid?: string | null, sdpMLineIndex?: number | null, usernameFragment?: string | null}`. Candidate strings are at most 4,096 UTF-8 bytes; optional strings are at most 256 UTF-8 bytes; the optional media-line index is an integer from 0 to 65,535. Unknown data fields, malformed shapes, unknown kinds, and invalid routes are silently ignored.

The server allows at most 80 signaling attempts per sending connection per one-second window, including rejected attempts. WebSocket messages are capped at 32,768 bytes to accommodate SDP; existing movement and chat validation still applies. Signals use the same bounded outgoing queues and single writer as other messages. Neither signals nor media are stored; media flows directly between consenting browsers, not through the room server. Reconnection creates a new ID with voice disabled.

Client `subscribeSignals(listener)` delivers transient `VoiceSignal` events and returns an unsubscribe function; signals are not added to the network store or chat history. Send consent with `send({type: 'voice', enabled: true})` and signaling with `send({type: 'signal', to, kind, data})`. WebRTC microphone capture requires a secure browser context (HTTPS or localhost).
