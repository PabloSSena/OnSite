# Protocol v0 (JSON / WebSocket)

One room, at most 10 players. Same-origin endpoint: `/ws`.
First message within 10 seconds: `{"type":"join","name":"Ana"}`.
The server assigns an ID and color; names have up to 24 characters. No authentication.

Client → server:
- `join`: `name`.
- `move`: `x`, `z`, `rotation` (radians around Y), `animation` (`idle` or `walk`), at 20 Hz.
- `chat`: `text`, up to 300 characters. At most one accepted message every 400 ms.

Server → client:
- `welcome`: `id`, `players` (initial state, including yourself).
- `join`: `player` (also sent to the joining player).
- `snapshot`: `players` (full state, 20 Hz).
- `leave`: `id`.
- `chat`: `id`, `name`, `text`, `at` (RFC3339 UTC).
- `correction`: `player` (accepted position after an invalid movement).

`Player`: `{id, name, color, x, z, rotation, animation}`.
Spawn: `(0, 6)`, on the porch outside the office. Y is height; avatars face -Z.
Map bounds: `-23.5 <= x, z <= 23.5` (checked by both client and server).
The office occupies x `[-16, 16]`, z `[-16, 4]`; a four-unit-wide open entrance
at x `[-2, 2]`, z `4` connects its central hallway to the garden courtyard.
Snapshots replace the remote player map. Local movement is immediate; remote
avatars use exponential position smoothing and rotation slerp. There is no
timestamped snapshot buffer yet; adding one is a useful exercise for handling jitter.

The server checks map bounds, speed with tolerance, and finite values.
Wall and furniture collision is client-only; this is **not** an authoritative simulation.
Chat uses connection identity and renders text through React, never HTML.
The outgoing queue is bounded: slow clients are disconnected without blocking the hub.
Ping every 20s, 5s timeout. Reconnection creates a new identity and resets to spawn.
No persisted history; the latest 100 messages live only in the tab.
A full room or invalid handshake closes the connection; the UI retries until the user leaves.
