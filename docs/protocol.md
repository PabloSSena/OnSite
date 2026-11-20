# Protocol v0 (JSON / WebSocket)

One room, at most 10 players. Same-origin endpoint: `/ws`.
First message within 10 seconds: `{"type":"join","name":"Ana"}`.
The server assigns an ID and color; names have up to 24 characters. No authentication.

Client → server:
- `join`: `name`.
- `move`: `x`, `z`, `rotation` (radians around Y), `animation` (`idle` or `walk`), at 20 Hz.
- `chat`: `text`, up to 300 characters. At most one accepted message every 400 ms.
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
- `chat`: `id`, `name`, `text`, `at` (RFC3339 UTC).
- `gif`: `id` (connection identity), `url`. Broadcast to everyone, including the sender.
  Clients show a camera-facing image above that player's head for 8 seconds after receipt;
  a new reaction replaces the previous one. Leaving/disconnecting clears reactions.
  Reactions are transient events, not included in snapshots or replayed to late joiners.
- `correction`: `player` (accepted position after an invalid movement).

`Player`: `{id, name, color, x, z, rotation, animation}`.
Spawn: `(0, 6)`. Y is height; avatars face -Z.
Snapshots replace the remote player map. Local movement is immediate; remote
avatars use exponential position smoothing and rotation slerp. There is no
timestamped snapshot buffer yet; adding one is a useful exercise for handling jitter.

The server checks map bounds, speed with tolerance, and finite values.
Furniture collision is client-only; this is **not** an authoritative simulation.
Chat uses connection identity and renders text through React, never HTML.
GIFs load directly from external hosts in a bounded `<img>` with no referrer.
The server does not download, proxy, or verify image contents; failed loads show a fallback.
Media hosts see viewers' IP addresses. Links can expire, particularly Discord attachments.
The outgoing queue is bounded: slow clients are disconnected without blocking the hub.
Ping every 20s, 5s timeout. Reconnection creates a new identity and resets to spawn.
No persisted history; the latest 100 messages live only in the tab.
A full room or invalid handshake closes the connection; the UI retries until the user leaves.
