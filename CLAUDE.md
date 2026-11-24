@AGENTS.md

Always work in your own Git worktree (see "Parallel work in worktrees" in
AGENTS.md): other agents run in parallel and share the repository, the stash,
Docker, and local ports.

First-person view is the priority: design and check every change for how it looks
and works in first person first (see "Rules" in AGENTS.md).

## Commands

- Full stack: `docker compose up --build -d`. Open http://localhost:8081.
  In a worktree, set a free `OFFICE_PORT` instead of sharing another stack's port.
- Development: `cd server && go run .`; separately,
  `cd client && npm ci && npm run dev`. Vite proxies `/ws` and `/healthz`
  to Go on `:8081`. Stop only your own conflicting Compose stack first.
- Single Go test: `cd server && go test -race -run TestMovementBoundary ./...`.
- Browser tests: `cd client && npx playwright test -g "first-person"`.
  Point `OFFICE_URL` at your isolated stack. Smoke and browser tests require
  an empty room; other connected tabs can invalidate player-count assertions.
- `server/.air.toml` provides optional Air hot reload. Its output in
  `server/tmp/` is ignored; do not commit generated binaries.

## Cross-file architecture

The hub in `server/main.go` owns room state. HTTP handlers send commands into
the hub; a 20 Hz ticker broadcasts snapshots. Each peer's bounded outgoing
queue has one writer. Never write directly to a WebSocket from the hub or
add room-state mutexes. Persistent desk ownership/styles live in `server/desks.go`.

`client/src/network.ts` owns the WebSocket, reconnection, and zustand store.
`Office.tsx` runs movement, collision, and camera updates with refs. It sends
local state at 20 Hz; remote avatars smooth toward the latest snapshot.
`App.tsx` contains the entry screen, menus, and desk dialogs. `GIFPicker.tsx`
handles reactions and recent links; text chat is removed. Input focus must
block game keys. Pointer lock controls first-person movement.

`client/src/world.ts` defines collision boxes, seats, and desk positions.
Furniture collision is client-side; the server checks finite values, bounds,
and speed tolerance, replying with corrections for invalid moves. Keep both
sides and `docs/protocol.md` aligned when changing shared values, including
spawn `(0, 6)`, map bounds, movement limits, animation fields, and desk positions.

The client connects to `/ws` on its own origin. Vite proxies it during
development; nginx proxies it to `server:8081` in Compose. Only the client
container publishes a host port. Do not hard-code backend URLs or add server CORS.

The README's learning exercises are not feature requests. Explain them rather
than implementing them unless the user asks.
