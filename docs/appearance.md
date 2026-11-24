# Character appearance and compact controls

## Behavior

- Choose separate tops, bottoms, shoes, skin, hair, hats, face, and backpack.
- Hats include an engineer hard hat, cowboy hat, feather headband, beanie, and cap.
  Selecting the engineer hard hat starts with safety yellow; its color remains editable.
  Hats follow head motion, appear in the preview and mirror, and stay hidden from
  the wearer's first-person camera without changing the view mode.
- Colors are curated palettes, not arbitrary CSS or uploaded textures.
- The entry screen and **Menu → Customize character** show a rotating preview.
- Editing during play applies immediately; closing the editor does not reconnect.
- `office-appearance-v1` local storage remembers the look on this browser.
  Unavailable storage falls back to the current in-memory look during reconnects.
- The server validates the entire appearance, assigns identity itself, and
  broadcasts valid changes to the room. It does not persist appearances.
- Clothes are procedural visuals on the existing rig: they do not change
  movement speed, collision, avatar height, or the walking animation.

The old branding header and room labels are removed. Menu keeps useful controls
mounted while collapsed, preserving voice and camera sessions. Camera panels are
depth-tested 3D geometry above avatars; the self-preview remains in the top-right.
The mirror includes the first-person player's overhead camera but not their fists.

Each mouse button punches its matching arm, with independent cooldowns.
F alternates arms. These are animations, not damage or physics interactions.

## Files

- `client/src/appearance.ts`: schema, palettes, defaults, validation, storage.
- `client/src/AppearanceEditor.tsx`, `CharacterPreview.tsx`, `appearance.css`: editor.
- `client/src/App.tsx`: entry/menu/dialog, saving and live updates.
- `client/src/Avatar.tsx`: clothing, face, skin, hair and first-person sleeves.
- `client/src/AvatarHat.tsx`: procedural hats attached to the head.
- `client/src/network.ts`, `server/main.go`, `docs/protocol.md`: shared contract.
- `client/src/WorldCameras.tsx`, `cameraVideo.ts`, `Webcams.tsx`: camera presentation.

No dependencies, authentication, external character assets, or database added.

## Validation so far

- Frontend type check and production builds: passed; existing bundle-size warning.
- Go race tests and vet in Go 1.26 Docker: passed, including appearance validation
  and room broadcasts.
- Smoke on the isolated port-8083 stack: passed.
- World collision script: passed, 27,504 connected walkable samples.
- Targeted browser checks: appearance validation, saved/live customization, GIF
  lifecycle, and compact HUD passed together. Independent-arm input test passed
  after scheduling its second input browser-side to avoid automation latency.
- Actions/mirror browser test passed after delaying DOM annotations until the
  Canvas event target is connected. This also fixed the missing initial tag and
  annotation cleanup error seen in the first interrupted regression run.
- Complete appearance/UI regression run: 27 passed, one combined-media test
  exhausted its three-minute total budget after the voice-rejoin stage.
  Rerunning that unchanged playback/cleanup coverage with a six-minute budget
  passed in 4.5 minutes. This is not a claim of a single all-green full-suite run.

Real-device media quality, physical-GPU performance, cross-network TURN behavior,
and a manual two-device camera occlusion/reflection inspection remain unverified.

## Microphone-driven mouth motion

`microphoneMeter.ts` measures microphone amplitude with one reusable 512-sample
Web Audio buffer. It never connects the local mic to speakers. `speechMotion.ts`
noise-gates and normalizes that value, and smooths mouth opening without React
state updates in the render loop. `Avatar.tsx` restores the selected resting face
when activity settles. The mirror renders the same mouth geometry.

The normalized `speaking` field travels with existing movement packets. Go rejects
nonfinite/out-of-range values, suppresses activity without voice consent, and
clears stale snapshot activity after one second. Even non-voice viewers see mouth
motion. This is volume animation, not phoneme recognition; no audio reaches Go.

Speech verification:

- Frontend type check/build and Go race tests/vet: passed.
- Two pure speech-motion tests: passed (noise gate, bounds, frame-rate smoothing).
- Deterministic Web Audio browser test: passed (non-voice viewer receives activity,
  silent input, mute/unmute, voice leave, analyser cleanup).
- Existing voice tests passed in the initial targeted run; its new speech test
  was subsequently made deterministic because Chromium's fake mic has quiet
  sections. The follow-up eight-case run was interrupted during reconnect testing.
  The remaining reconnect and pending-permission cancellation tests were rerun
  together: two passed. No claim of an uninterrupted eight-case final run.
- Latest isolated-stack smoke: passed.

The full 31-case suite was not rerun after speech was added. Real-microphone
sensitivity and a manual visual inspection of talking in the mirror remain
unverified.
