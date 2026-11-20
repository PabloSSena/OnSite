# Webcam handoff

## Isolation

- Worktree: `office-webcam`, branch: `webcam`, based on `5ca93cb`.
- Changes remain uncommitted and unmerged. The main and `office-updates`
  worktrees were not modified.
- Local preview: `http://localhost:18082`, Docker Compose project `office-webcam`.
  Its test-only Compose file is outside the repository at
  `C:\Users\pablo\AppData\Local\Temp\opencode\office-webcam.compose.yml`.

## Integration points

- New `client/src/Webcams.tsx`, `webcam.ts`, `webcams.css`, and `vite-env.d.ts`.
- `App.tsx`: import/render `Webcams` only while joined, update entry-screen
  feature copy, and fix the baseline Leave handler to set `joined` to `false`.
  Preserve the other agent's UI changes when integrating these small edits.
- `network.ts`: add `Player.camera`, a typed signaling subscription, and dispatch
  incoming `signal` messages. Preserve other networking changes.
- `server/main.go`: camera state, camera/signal handlers, signaling rate/size
  validation, and a 20 KiB WebSocket read limit. Preserve other server changes.
- Shared protocol: `docs/protocol.md`. Usage/limitations: `README.md`.
- No dependencies, voice, external services, or deployed infrastructure added.

## Verification

Passed:

- `npm ci` (zero reported vulnerabilities).
- `npm run check` and `npm run build` (Vite reports a large-bundle warning).
- `go test -race ./...` and `go vet ./...` using `golang:1.26` Docker
  containers because Go is not installed on the host.
- Isolated Docker Compose build/start.
- `OFFICE_URL=http://localhost:18082 npm run smoke`.
- `OFFICE_URL=http://localhost:18082 npm run test:e2e -- --timeout=120000`:
  all three tests passed, including fake-camera media playback, late join,
  two active cameras, off/on, leave/rejoin, WebSocket disconnection/reconnection,
  capture-track cleanup, and simulated permission denial.

Earlier browser runs timed out; the successful full-suite run used a two-minute
per-test timeout. Chromium's fake-camera tests require both fake-device and
fake-permission-UI launch flags on this host.

Unverified: physical camera/browser permission UI, other browser engines,
cross-device/cross-network connectivity, TURN, and 10-camera bandwidth/FPS.
Camera access requires HTTPS or localhost; direct mesh video may require a
configured TURN service on restrictive networks.
