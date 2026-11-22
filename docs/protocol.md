# Protocol v0 (JSON / WebSocket)

One room, at most 10 players. Same-origin endpoint: `/ws`.
First message within 10 seconds: `{"type":"join","name":"Ana"}`.
The server assigns an ID and color; names have up to 24 characters. No authentication.

Client → server:
- `join`: `name`, optional complete `appearance`. Missing/invalid appearance uses a default outfit.
- `appearance`: complete `appearance` object. Valid changes update only the sender's
  appearance and legacy `color` (the top color), then broadcast an immediate snapshot.
  Invalid updates are ignored without partially changing the outfit.
- `move`: `x`, `z`, `rotation` (radians around Y), `animation` (`idle`, `walk`, or `sit`; anything else is stored as `idle`), at 20 Hz. Optional `y` (height above the floor, 0–3.5), `punch` (RIGHT arm remaining animation seconds, 0–0.32), `punchLeft` (LEFT arm remaining animation seconds, 0–0.32), and `speaking` (normalized microphone amplitude, 0–1) default to zero when omitted. The legacy `punch` name retains its right-arm meaning. Nonfinite/out-of-range speech values reject the move; accepted speech levels are forced to zero unless voice consent is enabled.
- `chat`: `text`, up to 300 characters. At most one accepted message every 400 ms.
- `voice`: `enabled` (boolean). Explicit opt-in; published through the next snapshot.
- `signal`: `to` (current player ID), `kind` (`offer`, `answer`, or `ice`), `data` (described below). Only relayed when both players have voice enabled and the target is a different player currently in the room.
- `gif`: `url`, at most 1500 bytes. At most one accepted reaction every 2 seconds.
  Direct HTTPS URLs with a `.gif` path only (query strings are allowed).
  Allowed hosts: `media.tenor.com`, `media.giphy.com`, `i.giphy.com`,
  `media0.giphy.com` through `media4.giphy.com`, `cdn.discordapp.com`, `media.discordapp.net`.
  Credentials, fragments, and nonstandard ports are rejected. Invalid/rate-limited inputs are ignored.
- `camera`: `enabled` (boolean). Off by default; changes trigger an immediate snapshot.
- `camera-signal`: `to` (another joined player's ID), `session` (1–64 bytes),
  `kind` (`offer` or `answer`), `sdp` (1–16384 bytes).
  Offers require the sender's camera on; answers require the recipient's camera on.
  At most 40 camera signaling attempts per second per connection, independently of voice's 80-attempt limit; invalid signals are dropped.

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
- `camera-signal`: `from` (server-assigned sender ID), `session`, `kind`, `sdp`.
  Only delivered to the specified recipient through its bounded writer queue.

`Player`: `{id, name, color, appearance, x, y, z, punch, punchLeft, speaking, rotation, animation, voice, camera}`.

### Appearance

Exactly 14 fields, at most 1,024 JSON bytes:

- `top`: `tee`, `hoodie`, or `jacket`.
- `bottom`: `trousers` or `shorts`; `shoes`: `boots` or `sneakers`.
- `hair`: `short`, `bob`, or `none`; `hat`: `none`, `beanie`, or `cap`.
- `face`: `smile`, `neutral`, or `surprised`; `backpack`: boolean.
- `topColor`, `bottomColor`, `shoeColor`, `hatColor`, `backpackColor`: one of
  `#52d6b1`, `#ffb86b`, `#b69cff`, `#72baff`, `#ff7c9a`, `#25333e`, `#fff0d3`, `#b58453`.
- `skin`: one of `#f7dfcf`, `#efc9a9`, `#d9a47c`, `#b97953`, `#885438`, `#533528`.
- `hairColor`: one of `#a65d45`, `#25333e`, `#51382c`, `#805539`, `#d5b477`, `#c4c5c3`.

Missing, null, unknown, mistyped, or out-of-palette fields are rejected. No assets,
URLs, custom HTML, or arbitrary colors are accepted. The client stores the look
under `office-appearance-v1` in local storage, validates it on loading, and includes
the latest in-memory selection on every join/reconnect. No server persistence.

### Movement and world
Spawn: `(x: 0, y: 0, z: 6)`, on the porch outside the office, with `punch: 0`, `punchLeft: 0`, `speaking: 0`, `voice: false`, and `camera: false`. Y is feet height above the ground; avatars face -Z.
Map bounds: `-23.5 <= x, z <= 23.5` (checked by both client and server).
The office occupies x `[-16, 16]`, z `[-16, 4]`; a four-unit-wide open entrance
at x `[-2, 2]`, z `4` connects its central hallway to the garden courtyard.
Snapshots replace the remote player map. Local movement is immediate; remote
avatars use exponential position smoothing and rotation slerp. There is no
timestamped snapshot buffer yet; adding one is a useful exercise for handling jitter.

The server checks map bounds, horizontal speed with tolerance, finite values, and the `y`/`punch`/`punchLeft` ranges above. Invalid moves return the existing accepted player state (including both arms) through `correction`.
Jump physics and punch timing are client-side; these fields synchronize visual state, not combat or authoritative vertical physics.
Left mouse punches left; right mouse punches right. Each arm has an independent 0.45-second cooldown and both can animate simultaneously. Non-repeating F presses alternate arms, starting left. In first person only captured mouse input punches; the initial left click only captures the pointer, and right click never captures it. Only the game canvas suppresses the context menu. Focused inputs/buttons ignore game actions; blur, visibility, pointer-lock, and view changes clear pending actions.
Wall and furniture collision uses full 3D client-side bounds, including vertical contact; this is **not** an authoritative simulation.
The external world limits remain x/z ±23.5 at every height. The feet-height cap of 3.5 is an artificial movement limit, not a derived wall-top height; jumping from elevated surfaces does not raise it, and moves above it receive a correction.
Seats (chairs, sofas, benches) are fixed points in the shared client world data
(`seats` in `client/src/world.ts`): position, cushion height, and facing. Press E
within 1.3 units of a seat while on the floor to glide into it at 4 units/s (under the
server speed limit, so no correction), then send `animation: "sit"` with the seat's
position and facing. E, movement, or Space glides back to the spot you sat down from.
Other clients look up the seat at the sitter's position to pose the avatar. The server
does not know about seats and does not reserve them: two players can sit in the same
spot. Like furniture collision, this is not authoritative.
Chat uses connection identity and renders text through React, never HTML.
GIFs load directly from external hosts in a bounded `<img>` with no referrer.
The server does not download, proxy, or verify image contents; failed loads show a fallback.
Media hosts see viewers' IP addresses. Links can expire, particularly Discord attachments.
The outgoing queue is bounded: slow clients are disconnected without blocking the hub.
Ping every 20s, 5s timeout. Reconnection creates a new identity and resets to spawn.
No persisted history; the latest 100 messages live only in the tab.
A full room or invalid handshake closes the connection; the UI retries until the user leaves.

## Opt-in WebRTC signaling

### Speech animation

After explicit microphone opt-in, a local Web Audio analyser measures short RMS
windows without connecting the mic to speaker output. A noise gate suppresses
low-level input; normalized amplitude rides existing movement packets so even
viewers who have not joined voice can see mouth motion. This cosmetic value is
not proof of speech and can be spoofed by a voice-enabled client.
No audio samples or recordings are sent to Go. Mouth opening uses frame-rate-aware
smoothing, returning to the chosen face when silent, muted, or voice is off.
Snapshots clear activity if no accepted movement has arrived for one second,
preventing background/suspended renderers from leaving a mouth stuck open.
The analyser is released with voice capture; a failed/suspended analyser leaves
normal voice functional but mouth activity zero until it can resume.

Offer/answer `data` is `{type: "offer" | "answer", sdp: string}`, with `type` matching `kind` and SDP at most 16,000 UTF-8 bytes. ICE `data` is either `null` (end of candidates) or `{candidate: string, sdpMid?: string | null, sdpMLineIndex?: number | null, usernameFragment?: string | null}`. Candidate strings are at most 4,096 UTF-8 bytes; optional strings are at most 256 UTF-8 bytes; the optional media-line index is an integer from 0 to 65,535. Unknown data fields, malformed shapes, unknown kinds, and invalid routes are silently ignored.

The server allows at most 80 signaling attempts per sending connection per one-second window, including rejected attempts. WebSocket messages are capped at 32,768 bytes to accommodate SDP; existing movement and chat validation still applies. Signals use the same bounded outgoing queues and single writer as other messages. Neither signals nor media are stored; media flows directly between consenting browsers, not through the room server. Reconnection creates a new ID with voice disabled.

Client `subscribeSignals(listener)` delivers transient `VoiceSignal` events and returns an unsubscribe function; signals are not added to the network store or chat history. Send consent with `send({type: 'voice', enabled: true})` and signaling with `send({type: 'signal', to, kind, data})`. WebRTC microphone capture requires a secure browser context (HTTPS or localhost).

## Opt-in webcams

Webcams use video-only WebRTC, not WebSocket media. Each camera sender creates a
send-only peer connection to each other player, including late joiners; viewers
can answer without enabling their own camera. Separate incoming/outgoing links
avoid simultaneous-offer collisions. SDP includes gathered ICE candidates (no
trickle ICE); `session` identifies an offer so stale answers are ignored.
WebSocket messages share the 32 KiB limit used by voice signaling.
Turning the camera off stops local tracks and outgoing links; snapshots remove
remote tiles/links. Leaving or disconnecting closes all links and stops capture.
Reconnection leaves the camera off until the user explicitly enables it again.

Camera events use `camera-signal` and `onVideoSignal(listener)` exclusively; voice events keep `signal` and `subscribeSignals(listener)`. Both subscriptions are transient and return unsubscribe functions. A payload from one namespace does not satisfy the other's validation. Consent and signaling rate limits are independent.

Without `VITE_ICE_SERVERS`, webcams use no external ICE servers (`[]`) while voice retains its Google STUN default. Setting this shared build-time variable configures both media paths; webcam connectivity across NAT may require STUN/TURN.
