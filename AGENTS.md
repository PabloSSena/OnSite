# Instructions for humans and agents

## Goal
A 3D office for 5–10 friends and learning. Prefer simplicity and verifiable
behavior over abstractions. Do not add Kubernetes, Redis, authentication, voice,
or libraries unless the task calls for them.

## Project map
- `client/src/Office.tsx`: render loop, movement, collision, and camera.
- `client/src/Avatar.tsx`: procedural character rig and first-person hands.
- `client/src/avatarMotion.ts`: distance-driven gait and leg pose helpers.
- `client/src/network.ts`: connection, protocol, and remote state.
- `client/src/App.tsx`: entry screen, HUD, and chat.
- `server/main.go`: in-memory hub, validation, and WebSocket.
- `docs/protocol.md`: shared contract.

## Rules
- Use separate Git worktrees for branch development. Keep feature changes in the
  `updates` worktree; do not switch or modify the original `main` checkout.
- Use English for all project content: comments, documentation, UI copy, test
  descriptions, and sample messages. Conversation language may follow the user's preference.
- Read relevant files before editing; preserve existing work.
- Make small changes. Explain trade-offs and never claim checks that were not run.
- Do not update React state every frame. Use refs in the loop and zustand for networking.
- Server WebSocket writes go through each connection's writer; the hub owns room state.
- Protocol changes require updating both sides and the documentation.
- Do not add dependencies for convenience without explaining why.
- Never commit credentials; do not provision AWS resources or deploy unless asked.

## Verification
- Frontend: `cd client && npm ci && npm run check && npm run build`
- Backend: `cd server && go test -race ./... && go vet ./...`
- Integration: `docker compose up --build -d`, then `cd client && npm run smoke`
- Browser: in `client/`, run `npx playwright install chromium` and `npm run test:e2e`.
- Manual: two tabs at http://localhost:8081; movement, collision, chat, leaving, and reconnection.
- Record exactly what passed and what remains unverified.

## Task completion
A short summary, relevant files, checks, and actual limitations.
The human should be able to explain the change before accepting it.
