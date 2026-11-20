# Office

Our 3D office: React Three Fiber + Go + WebSocket. One room for up to 10 friends,
box avatars, WASD/arrow-key movement, a third-person camera, AABB collision,
floating name tags, chat, and opt-in webcams. No accounts, database, or required external services.

## Run it

Requires Docker Desktop with Linux containers.

```sh
docker compose up --build -d
```

Open **http://localhost:8080** in two tabs, join with different names, and move around.
Click outside the chat to use WASD again. `Leave` closes the connection.

```sh
docker compose logs -f
docker compose down
```

For friends on the same network: `http://HOST-IP:8080` (allow the port through your firewall).
This prototype is for trusted environments: anyone who can reach the address can join.
For internet access, configure HTTPS with Caddy and access control.
No microphone is needed at this stage.

## Webcams

After joining, click **Turn camera on** and grant browser camera permission.
Your video appears in the webcam strip for everyone in the room; you can see
other cameras without enabling your own. Audio is never requested or sent.
**Turn camera off**, leaving, or losing the room connection stops capture.
Reconnecting does not automatically restart your camera.

Camera access requires **HTTPS or localhost**. Plain HTTP on a LAN IP still
supports movement/chat but browsers will not allow webcam capture.
Video uses direct WebRTC connections with low-resolution, 15 fps capture.
Each sender uploads once per viewer, so test bandwidth before using all 10 cameras.
No media is recorded or forwarded by the Go server. Participants learn each
other's network addresses through WebRTC; use this prototype with trusted friends.

By default, no STUN/TURN service is contacted. Local connections work where
direct routing is available; separate networks/restrictive NATs may fail.
For those networks, configure `VITE_ICE_SERVERS` at frontend build/dev time with
a JSON array of browser `RTCIceServer` entries. For example, a STUN entry is
`[{"urls":"stun:YOUR-STUN-HOST:3478"}]`. Reliable internet use generally needs TURN,
not only STUN. Use short-lived TURN credentials: Vite configuration is public
in the browser bundle. No relay is provisioned by this project.

## Development with hot reload

Go 1.26+ and Node 22.12+ (Node 24 recommended).

Terminal 1:
```sh
cd server
go mod download
go run .
```

Terminal 2:
```sh
cd client
npm ci
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/ws` to Go on `:8080`.
Without Go installed: `docker compose run --rm --build -p 8080:8080 server`.
Stop the full Compose stack first to avoid a port conflict.

## Checks

```sh
cd client
npm run check
npm run build
npm run smoke
```

The smoke test requires Compose running on `:8080`, with no other users in the room.
It uses Node's native WebSocket and tests two real clients through nginx:
movement, chat, leaving, and a new connection. It does not test WebGL or the camera.

Browser test (Chromium, two real tabs; Compose must be running):
```sh
cd client
npx playwright install chromium
npm run test:e2e
```
Checks joining, visible remote movement, chat, and leaving without JavaScript errors.
Webcam tests use Chromium's fake camera and check video reaching a late viewer,
two-way sharing, toggling, track cleanup on leave/disconnect, camera-off
reconnection, and a simulated permission denial. Physical cameras and TURN across
different networks still need manual testing.
Screenshot: `client/test-results/office.png`. FPS and camera behavior around
corners still need manual evaluation.

```sh
cd server
go test -race ./...
go vet ./...
```

Without local Go, run these from the repository root:
```sh
docker run --rm -v "${PWD}/server:/src" -w /src golang:1.26 go test -race ./...
docker run --rm -v "${PWD}/server:/src" -w /src golang:1.26 go vet ./...
```

Manual checklist:
- Two tabs, two names; movement appears in the other tab.
- Diagonal movement is not faster. Desks/walls block movement; corners allow sliding.
- The camera moves closer near walls; typing in chat does not move the avatar.
- Chat appears in both tabs; closing one removes its avatar.
- Restarting the server reconnects players and resets them to spawn.
- Enable webcams in two browsers; both videos appear with names and no audio.
- Turn a camera off or leave; its video disappears and the device is released.
- Disconnect/reconnect; the camera stays off until explicitly enabled again.
- Check smoothness/FPS on a low-end laptop; controls require a keyboard, not touch.

## Decisions and trade-offs

- **One in-memory room.** The hub owns state; one loop serializes inputs.
  Each connection has a reader goroutine (the HTTP handler) and a writer goroutine.
  The second is intentional: slow clients must not block broadcasts.
- **Full snapshots at 20 Hz + JSON.** Simple, readable, and sufficient for 10 people.
  Do not introduce binary encoding before measuring bandwidth and CPU.
- **Immediate local movement.** Networking does not block WASD; remote avatars interpolate.
  The server runs sanity checks, not physics. Local AABB collision avoids Rapier for now.
- **Fixed camera behind/above, without orbit.** Predictable WASD directions; a raycast
  moves the camera closer when it hits an obstacle. Next: test corners and the near plane.
- **Zustand only for network/UI state.** Per-frame transforms use refs.
- **Same-origin proxy.** The same code works with Vite and nginx, without CORS.
- **No persistence.** Restarting clears the room/chat. Reconnecting assigns a new ID.
- **Video-only WebRTC mesh.** No new dependencies or media server. Add TURN for
  restrictive networks; voice and proximity are not implemented.

Layout and colliders live in `client/src/world.ts`. The contract lives in
[`docs/protocol.md`](docs/protocol.md). No Kubernetes manifests at this stage.

## Your part as a developer

The repetitive plumbing is generated. Before expanding:
1. Read `hub.run → handle → broadcast` and explain who owns state and why
   the writer has a bounded queue. Run with `-race`.
2. Change movement speed and network frequency; compare 5 Hz with 20 Hz.
   Implement a snapshot buffer with ~100 ms delay and compare it with current smoothing.
3. Add furniture and its collider; understand delta time, axes, and slerp before
   adding Rapier or animated models.
4. Start WebRTC with two people and a call button. Then add signaling,
   TURN, and proximity with hysteresis (different enter/leave radii).
   Opening/closing peer connections on every boundary crossing causes churn:
   keep connections for a grace period and adjust volume.
5. Then use Docker → EC2 → kind → AWS/K8s as a learning lab. Each stage needs
   a success criterion; “Day 1–4” describes an order, not a delivery promise.

## AI-assisted engineering

See [`docs/ai-workflow.md`](docs/ai-workflow.md) and [`AGENTS.md`](AGENTS.md).
The initial harness is versioned context + tools + checks + review.
You do not need to build an agent platform to get started.

All project content is written in English, including comments, documentation,
UI copy, and tests.
