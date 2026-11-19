# Office

Our 3D office: React Three Fiber + Go + WebSocket. One room for up to 10 friends,
box avatars, WASD/arrow-key movement, a third-person camera, AABB collision,
floating name tags, and chat. No accounts, database, or required external services.

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
- **No voice yet.** Validate real usage and movement first; add coturn alongside
  WebRTC when there is an audio path to test.

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
