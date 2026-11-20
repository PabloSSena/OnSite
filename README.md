# Office

Our 3D office: React Three Fiber + Go + WebSocket. One room for up to 10 friends,
articulated low-poly avatars, WASD/arrow-key movement, third-person and first-person cameras, AABB collision,
floating name tags, jumping onto furniture, animated punches, a wall mirror,
text chat, GIF reactions, opt-in voice, and optional webcams. No accounts or database.

The world is a cozy four-room office house with a connected central hall and
garden courtyard. See [`docs/world.md`](docs/world.md) for the layout and routes.

## Run it

Requires Docker Desktop with Linux containers.

```sh
docker compose up --build -d
```

Open **http://localhost:8081** in two tabs, join with different names, and move around.
Click outside the chat to use WASD again. `Leave` closes the connection.

### Camera views

The office starts in **first-person view**. After joining, toggle
**First-person view** in the header off to use the original third-person camera.
Click the 3D scene to capture the mouse, then move the mouse to look around.
WASD/arrow keys move relative to where you are looking, with the same speed and
collision as third-person mode. Press **Escape** to release the mouse and use
chat or switch views. Movement pauses while the mouse is released in first-person.
Your upper body and name tag are hidden from the direct first-person
view; look down to see your legs and boots. Friends and the mirror still
see your full avatar.
Mouse capture requires a supported desktop browser on localhost or HTTPS.

### Jump, punch, and mirror

- Press **Space** to jump. Release and press again after landing for another jump.
- Press **F** or **left click** the scene to punch. First-person displays both fists,
  with the right fist extending during a punch. The initial mouse-capture click
  does not punch; click again once captured.
- Jumping and punching are visible to friends and in the mirror at the north end
  of the central hallway (walk straight ahead from spawn). It reflects your viewing
  angle, including your own full body in first-person.
- Escape releases first-person controls for chat. Typing does not trigger actions.
- Jump toward tables, the bench, planters, or monitors to land on their tops.
  Jump again from a surface or walk off to fall. Solid sides/undersides still
  block you, and you cannot jump through the room boundary.
- Punching is animation only: no damage or knockback.
- The mirror adds one scene render when visible; its fixed 1024×512 reflection
  target limits GPU cost. DOM name tags/chat are not part of the reflected scene.

### Characters and animation

Characters are original, playful low-poly explorers: rounded silhouettes, colored
outfits, small packs, expressive eyes, and articulated arms, knees, and boots.
The design takes broad inspiration from lighthearted co-op climbing games;
it does not use their character models, textures, or animation assets.

Walking follows actual distance travelled, with alternating foot lifts, bent knees,
level boot soles, opposite arm swings, and a subtle torso sway. Walking into a wall
does not keep the legs running. Starts/stops blend smoothly. Idle breathing/blinks,
airborne leg tucks, a short landing compression, and a shoulder/elbow punch pose
add movement without changing the physics or movement speed.
First-person uses matching rounded hands and sleeves with restrained walking sway;
there is no forced camera bob. This is procedural animation, not ragdoll physics
or climbing/grabbing mechanics.

### Voice chat

1. Join the office, then click **Join voice** in the voice panel.
2. Allow microphone access. Ask your friend to join voice too.
3. Use **Mute microphone** / **Unmute microphone** or **Leave voice**.
   If the browser blocks playback, click **Enable sound**.

Voice is room-wide (not proximity-based) and opt-in. Joining the office never
opens the microphone. Leaving voice/the room, losing the server connection, or
closing the page releases microphone tracks and peer connections. Reconnecting
does not silently turn voice back on. Use headphones to avoid feedback.

Browsers require **localhost or HTTPS** for microphone access. Plain HTTP on
`HOST-IP` can run the game but normally cannot use voice. Use an HTTPS proxy for
friends connecting over the LAN/internet.

Audio uses encrypted browser-to-browser WebRTC; Go relays only consent/signaling,
not audio. The default public STUN server is `stun:stun.l.google.com:19302` and is
contacted only after opting into voice. WebRTC exposes network candidates to the
other opted-in players; use this prototype only with trusted friends.
There is no TURN relay bundled, so restrictive NATs/firewalls may prevent voice.

To use your own STUN/TURN servers, set `VITE_ICE_SERVERS` to a JSON array at Vite
startup/build time, for example `[{"urls":"stun:your-stun.example:3478"}]`.
Set it to `[]` for host-only local connections. Vite values are public client
configuration: never include long-lived TURN credentials; use short-lived
credentials from a trusted issuer when adding production TURN support.
Docker builds accept this variable as a build argument:
`docker compose build --build-arg VITE_ICE_SERVERS='[]' client`.
No relay infrastructure is provisioned by this project.

### Branch isolation

Use the `updates` worktree at `../office-updates` for feature development.
Run commands from that directory, not the original `office` checkout. Worktrees
have separate working files; switching the original checkout does not move
uncommitted feature edits between branches. Pre-existing edits in the original
checkout have not been removed.

`updates` integrates the source worktrees `main`, `gifs`, `webcam`, and
`world/cozy-office`. Their uncommitted working files were captured in detached
snapshot commits before merging; their branches, indexes, and files were not
modified. Generated `server/tmp` build output was excluded.

To run this worktree alongside an app already using port 8081 (PowerShell):

```powershell
$env:OFFICE_PORT = '8082'
docker compose up --build -d
```

Open **http://localhost:8082**. Set `$env:OFFICE_URL = 'http://localhost:8082'`
before running smoke/browser checks against that instance.

### GIF reactions

Paste a direct HTTPS `.gif` link into **GIF link** and press **GIF** to show an
animated reaction above your avatar for 8 seconds, visible to everyone currently
connected. Supported media hosts: Tenor, GIPHY, and Discord (see the
[protocol](docs/protocol.md) for the exact allowlist). Use **Copy image address**,
not a GIF share-page URL. No API key is needed.
Reactions are limited to one every 2 seconds and replace your previous GIF.
Images load from the external host, which receives viewers' IP addresses.
Expired/broken links show “GIF unavailable”; no uploads or link scraping are provided.

```sh
docker compose logs -f
docker compose down
```

For friends on the same network: `http://HOST-IP:8081` (allow the port through your firewall).
This prototype is for trusted environments: anyone who can reach the address can join.
For internet access, configure HTTPS with Caddy and access control.
A microphone is optional; voice starts only after choosing **Join voice**.

## Webcams

After joining, click **Turn camera on** and grant browser camera permission.
Your video appears in the webcam strip for everyone in the room; you can see
other cameras without enabling your own. The camera feature never requests audio;
microphone audio is a separate **Join voice** opt-in.
**Turn camera off**, leaving, or losing the room connection stops capture.
Reconnecting does not automatically restart your camera.

Camera access requires **HTTPS or localhost**. Plain HTTP on a LAN IP still
supports movement/chat but browsers will not allow webcam capture.
Video uses direct WebRTC connections with low-resolution, 15 fps capture.
Each sender uploads once per viewer, so test bandwidth before using all 10 cameras.
No media is recorded or forwarded by the Go server. Participants learn each
other's network addresses through WebRTC; use this prototype with trusted friends.

By default, the camera feature contacts no STUN/TURN service (voice has its own
public STUN default described above). Local camera connections work where
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

Open **http://localhost:5173**. Vite proxies `/ws` to Go on `:8081`.
Without Go installed: `docker compose run --rm --build -p 8081:8081 server`.
Stop the full Compose stack first to avoid a port conflict.

## Checks

```sh
cd client
npm run check
npm run build
npm run smoke
```

The smoke test requires Compose running on `:8081`, with no other users in the room.
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
Voice tests use Chromium fake audio, verify received RTP bytes in both directions,
mute/unmute, microphone denial/retry, and cleanup. Real microphones, echo quality,
and cross-network/TURN behavior still need two-device testing.

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
- Toggle first-person, click the scene, look up/down and turn; movement follows
  the horizontal view direction. Escape releases the mouse for chat; switching
  back restores the third-person avatar and controls.
- Chat appears in both tabs; closing one removes its avatar.
- Space jumps and lands once per press; F/left click punches, with fists visible
  in first-person. Friends see both actions; chat input triggers neither.
- Jump onto a table, jump again onto its monitor, then walk off and land on the floor.
- Two devices with headphones: explicitly join voice, verify both directions,
  mute/unmute, leave voice, deny permission, and reconnect without automatic capture.
- Face the north-wall mirror and move/turn/jump/punch. Check that the reflection
  includes your body, tracks perspective, and excludes the camera-attached fists.
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
  moves the camera closer when it hits an obstacle. Default first-person uses
  pointer-lock mouse look at eye height and horizontal camera-relative movement.
  Both views share collision and networking. Height and punch animation are sent
  with movement; see `docs/protocol.md` for their bounds and defaults.
- **Zustand only for network/UI state.** Per-frame transforms use refs.
- **Same-origin proxy.** The same code works with Vite and nginx, without CORS.
- **No persistence.** Restarting clears the room/chat. Reconnecting assigns a new ID.
- **Small-room WebRTC mesh.** One audio connection per other opted-in friend.
  This is simple for 5–10 users but scales poorly compared with an SFU. No voice
  recording, positional attenuation, or managed TURN service.
- **Independent video mesh.** Cameras and microphones have separate consent,
  capture tracks, connections, and signaling namespaces. No media server or new
  dependency; configure TURN for restrictive networks.

Layout and colliders live in `client/src/world.ts`. The contract lives in
[`docs/protocol.md`](docs/protocol.md). No Kubernetes manifests at this stage.
The character rig lives in `client/src/Avatar.tsx`; its testable gait/leg-pose
helpers live in `client/src/avatarMotion.ts`. Animation uses refs, not per-frame
React state, and needs no new network messages or dependencies.

## Your part as a developer

The repetitive plumbing is generated. Before expanding:
1. Read `hub.run → handle → broadcast` and explain who owns state and why
   the writer has a bounded queue. Run with `-race`.
2. Change movement speed and network frequency; compare 5 Hz with 20 Hz.
   Implement a snapshot buffer with ~100 ms delay and compare it with current smoothing.
3. Add furniture and its collider; understand delta time, axes, and slerp before
   adding Rapier or animated models.
4. Validate WebRTC with two real devices. Then add authenticated short-lived
   TURN credentials and proximity with hysteresis (different enter/leave radii).
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
