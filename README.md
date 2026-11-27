# Office

Our 3D office: React Three Fiber + Go + WebSocket. One room for up to 10 friends,
articulated low-poly avatars, WASD/arrow-key movement, third-person and first-person cameras, AABB collision,
floating name tags, jumping onto furniture, animated punches, a wall mirror,
GIF reactions, opt-in voice, and optional webcams. No text chat, accounts, or database.

The world is a cozy four-room office house with a connected central hall and
garden courtyard. See [`docs/world.md`](docs/world.md) for the layout and routes.

## Run it

Requires Docker Desktop with Linux containers.

```sh
docker compose up --build -d
```

Open **http://localhost:8081** in two tabs, join with different names, and move around.
Close open panels to use WASD again. `Leave` closes the connection.

### Menu and customization

The old branding header and floating room titles are removed. Open **Menu** for
connection status, camera mode, leaving, voice, webcam controls, and customization.
Closing Menu hides controls without disconnecting audio or video.

Customize before joining or through **Menu → Customize character** while playing.
The rotating preview shows separate T-shirts/hoodies/jackets, trousers/shorts,
boots/sneakers, skin tones, hair, hats, faces, and an optional backpack. Use the
curated color palettes for individual pieces. Changes are visible to everyone
immediately and saved on this browser without an account or database.

### Camera views

The office starts in **first-person view**. After joining, toggle
**First-person view** in Menu off to use the original third-person camera.
Click the 3D scene to capture the mouse, then move the mouse to look around.
WASD/arrow keys move relative to where you are looking, with the same speed and
collision as third-person mode. Press **Escape** to release the mouse and use
the GIF picker or switch views. Movement pauses while the mouse is released in first-person.
Your upper body and name tag are hidden from the direct first-person
view; look down to see your legs and boots. Friends and the mirror still
see your full avatar.
Mouse capture requires a supported desktop browser on localhost or HTTPS.

### Jump, punch, and mirror

- Press **Space** to jump. Release and press again after landing for another jump.
- **Left click** punches with the left arm; **right click** punches with the right.
  Each arm has its own cooldown, so both can punch together. **F** alternates arms.
  The initial mouse-capture click does not punch; click again once captured.
- Jumping and punching are visible to friends and in the mirror at the north end
  of the central hallway (walk straight ahead from spawn). It reflects your viewing
  angle, including your own full body in first-person.
- Escape releases first-person controls for panels. Typing does not trigger actions.
- Jump toward tables, the bench, planters, or monitors to land on their tops.
  Jump again from a surface or walk off to fall. Solid sides/undersides still
  block you, and you cannot jump through the room boundary.
- Punching is animation only: no damage or knockback.

### Sit down

- Walk up to a chair, sofa, or picnic bench. When "Press E to sit" appears, press
  **E**. Your avatar slides in, faces the table/room, and sits. Friends see it too.
- Press **E** again, move, or jump to stand back up where you were.
- Seats aren't reserved, so two people can end up in the same spot.
- The mirror adds one scene render when visible; its fixed 1024×512 reflection
  target limits GPU cost. GIF reactions appear in the mirror, including your own
  reaction in first person. DOM name tags and control panels are not reflected.

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

1. Join the office, open **Menu**, then click **Join voice**.
2. Allow microphone access. Ask your friend to join voice too.
3. Use **Mute microphone** / **Unmute microphone** or **Leave voice**.
   If the browser blocks playback, click **Enable sound**.

Voice is room-wide (not proximity-based) and opt-in. Joining the office never
opens the microphone. Leaving voice/the room, losing the server connection, or
closing the page releases microphone tracks and peer connections. Reconnecting
does not silently turn voice back on. Use headphones to avoid feedback.

Your avatar's mouth opens with microphone volume while you speak, settles during
silence, and stops when muted or voice is off. Everyone sees the animation,
including players who have not joined voice, and it appears in the mirror.
Only a normalized activity value reaches Go—not audio samples. This is simple
volume-driven animation, not word/phoneme lip sync; quieter background noise is gated.

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

Press **Escape** to release the mouse, open **GIFs**, and paste a supported direct HTTPS `.gif` link to show an
animated reaction above your avatar for 8 seconds, visible to everyone currently
connected. Supported media hosts: Tenor, GIPHY, and Discord (see the
[protocol](docs/protocol.md) for the exact allowlist). Use **Copy image address**,
not a GIF share-page URL. No API key is needed.
After the server accepts your reaction, the picker keeps its link in localStorage
on this browser, bounded to 24 unique entries. Click a recent thumbnail to send it
again. History survives refreshes but is not shared across browsers or site addresses.
This is local link history, not shared chat history.
Reactions are limited to one every 2 seconds and replace your previous GIF.
Images load from the external host, which receives viewers' IP addresses.
Expired/broken links show “GIF unavailable”; no uploads or link scraping are provided.
Mirror reactions use a separate 3D card with the same eight-second lifetime.
The media host must permit cross-origin image access for that card; otherwise
the mirror shows “GIF unavailable” while the ordinary reaction can still work.
Browsers with WebCodecs GIF decoding animate the reflection; other browsers show
a static frame. Decoders and textures are released on expiry, replacement, or leave.

```sh
docker compose logs -f
docker compose down
```

For friends on the same network: `http://HOST-IP:8081` (allow the port through your firewall).
This prototype is for trusted environments: anyone who can reach the address can join.
For internet access, configure HTTPS with Nginx or Caddy and access control.
A microphone is optional; voice starts only after choosing **Join voice**.

## Vercel frontend and Lightsail backend

The frontend can be hosted separately from the Go server. No new dependencies
or WebSocket protocol changes are required.

### Vercel

- Root directory: `client`; framework: Vite.
- Install command: `npm ci`; build command: `npm run build`; output: `dist`.
- Set the Production environment variable
  `VITE_WS_URL=wss://api.onsite.dev.br/ws`, then deploy again.
- This URL is public configuration, not a secret. All `VITE_` variables are
  embedded in the client bundle. Never put AWS credentials or secrets there.
- When unset or blank, the client continues to connect to `/ws` on the page's
  host, preserving local Vite and Docker setups.

### Lightsail

Keep the backend bound to localhost (currently `127.0.0.1:8081`) with Nginx
terminating HTTPS on port 443 and forwarding WebSocket upgrades to Go.
`https://api.onsite.dev.br/healthz` should return `ok` with a valid certificate.

Rebuild the backend with these changes and configure its container environment:

```env
WS_ALLOWED_ORIGINS=onsite-plum.vercel.app
```

For `docker run`, pass `-e WS_ALLOWED_ORIGINS=onsite-plum.vercel.app`
when recreating the container, preserving its existing port mapping, volumes,
and other settings. An `export` in the SSH shell does not update a running
container. If using this repository's Compose file, set the variable in the
Compose environment or `.env` and recreate the server service.

The allowlist uses comma-separated hostnames without `https://` or paths.
For example, after adding a custom frontend domain:
`WS_ALLOWED_ORIGINS=onsite-plum.vercel.app,office.onsite.dev.br`.
Keep the list explicit; do not allow all Vercel preview domains with a wildcard.
Same-origin clients remain supported when the variable is unset.
Origin checks do not authenticate users; anyone with network access can still
attempt to join using a non-browser client.

After both deployments, open the frontend and check DevTools → Network → WS.
The connection to `wss://api.onsite.dev.br/ws` should return `101 Switching
Protocols`. Join from two tabs and check movement synchronization.
Health checks alone do not verify WebSocket upgrades or origin validation.
Voice and webcams use separate browser-to-browser WebRTC connections; this
deployment does not add a TURN relay for restrictive networks.

## Webcams

After joining, open **Menu**, click **Turn camera on**, and grant camera permission.
Video appears on a small 3D panel above each person's head, hidden by walls and
included in mirror reflections. You can see other cameras without enabling your
own. Your small self-preview stays in the top-right corner; in first person your
overhead panel is visible only in the mirror. The camera feature never requests audio;
microphone audio is a separate **Join voice** opt-in.
**Turn camera off**, leaving, or losing the room connection stops capture.
Reconnecting does not automatically restart your camera.

Camera access requires **HTTPS or localhost**. Plain HTTP on a LAN IP still
supports movement and GIF reactions but browsers will not allow webcam capture.
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
movement, GIF payload/connection identity (including delivery to the sender), leaving,
and a new connection. It does not fetch GIF images or test WebGL or the camera.

Browser test (Chromium, two real tabs; Compose must be running):
```sh
cd client
npx playwright install chromium
npm run test:e2e
```
The browser suite includes joining, visible remote movement, and leaving without
JavaScript errors. GIF checks cover clipboard paste in first person, delivery to
another player, recent-thumbnail reuse, persistence across refreshes, and the
absence of text-chat controls.
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
- The camera moves closer near walls; typing in panels does not move the avatar.
- Toggle first-person, click the scene, look up/down and turn; movement follows
  the horizontal view direction. Escape releases the mouse for panels; switching
  back restores the third-person avatar and controls.
- Send a GIF from the picker; it appears above the sender in both tabs. Reuse a
  recent link after reload; closing a tab removes its avatar.
- Space jumps and lands once per press; left/right click punches the matching arm
  in first-person. Friends see both actions; panel inputs trigger neither.
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
- **Transient room state.** Restarting clears players and GIF reactions.
  Reconnecting assigns a new ID. Recent GIF links stay in this browser's localStorage;
  desk persistence is separate and controlled by `DESKS_FILE`.
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
