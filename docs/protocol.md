# Protocol v0 (JSON / WebSocket)

One room, at most 10 players. Same-origin endpoint: `/ws`.
First message within 10 seconds: `{"type":"join","name":"Ana"}`.
The server assigns an ID and color; names have up to 24 characters. No authentication.

Client → server:
- `join`: `name`.
- `move`: `x`, `z`, `rotation` (radians around Y), `animation` (`idle` or `walk`), at 20 Hz.
- `chat`: `text`, up to 300 characters. At most one accepted message every 400 ms.
- `camera`: `enabled` (boolean). Off by default; changes trigger an immediate snapshot.
- `signal`: `to` (another joined player's ID), `session` (1–64 bytes),
  `kind` (`offer` or `answer`), `sdp` (1–16384 bytes).
  Offers require the sender's camera on; answers require the recipient's camera on.
  At most 40 signaling messages per second per connection; invalid signals are dropped.

Server → client:
- `welcome`: `id`, `players` (initial state, including yourself).
- `join`: `player` (also sent to the joining player).
- `snapshot`: `players` (full state, 20 Hz).
- `leave`: `id`.
- `chat`: `id`, `name`, `text`, `at` (RFC3339 UTC).
- `correction`: `player` (accepted position after an invalid movement).
- `signal`: `from` (server-assigned sender ID), `session`, `kind`, `sdp`.
  Only delivered to the specified recipient through its bounded writer queue.

`Player`: `{id, name, color, x, z, rotation, animation, camera}`.
Spawn: `(0, 6)`. Y is height; avatars face -Z.
Snapshots replace the remote player map. Local movement is immediate; remote
avatars use exponential position smoothing and rotation slerp. There is no
timestamped snapshot buffer yet; adding one is a useful exercise for handling jitter.

The server checks map bounds, speed with tolerance, and finite values.
Furniture collision is client-only; this is **not** an authoritative simulation.
Chat uses connection identity and renders text through React, never HTML.
The outgoing queue is bounded: slow clients are disconnected without blocking the hub.
Ping every 20s, 5s timeout. Reconnection creates a new identity and resets to spawn.
No persisted history; the latest 100 messages live only in the tab.
A full room or invalid handshake closes the connection; the UI retries until the user leaves.

Webcams use video-only WebRTC, not WebSocket media. Each camera sender creates a
send-only peer connection to each other player, including late joiners; viewers
can answer without enabling their own camera. Separate incoming/outgoing links
avoid simultaneous-offer collisions. SDP includes gathered ICE candidates (no
trickle ICE); `session` identifies an offer so stale answers are ignored.
WebSocket messages are limited to 20 KiB to accommodate SDP.
Turning the camera off stops local tracks and outgoing links; snapshots remove
remote tiles/links. Leaving or disconnecting closes all links and stops capture.
Reconnection leaves the camera off until the user explicitly enables it again.
