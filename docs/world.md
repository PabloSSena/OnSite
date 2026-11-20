# The Commons

A cozy startup house and walkable garden for the existing shared office.
No new assets, services, dependencies, or protocol message types are required.

```text
                     NORTH (-Z)
       +----------------+----+----------------+
       |                |    |                |
       |  THE STUDIO    :    :   IDEA ROOM    |
       |  Four desks    |    | Meeting table  |
       |                |    |                |
       +----------------+    +----------------+
       |                |    |                |
       |  LIVING ROOM   :    :  THE KITCHEN   |
       |  Sofas & rug   |    | Coffee & island|
       |                |    |                |
       +----------------+    +----------------+
                        PORCH
                   Spawn at (0, 6)

          Picnic table  |  Garden lounge
                        |
                    Garden path
          Raised beds       Raised beds
                     SOUTH (+Z)
```

Colons indicate open doorways into the central hallway. Walk north from spawn
to enter; walk south to leave. All four rooms connect through that hallway.
The courtyard also wraps around the sides of the house.

## Rendering and collision

- `client/src/world.ts` owns the solid wall, furniture, and monitor boxes.
  Height-aware movement uses those bounding dimensions, expanded horizontally
  by the player's 0.35-unit radius and tested against a 1.55-unit body height.
  Swept vertical collision supports landing on tops and hitting undersides.
- Furniture intentionally uses solid envelope collision, not individual legs
  and seats. Tables render thinner tops and legs within their envelopes;
  chair seats sit below their envelope tops. Walking underneath furniture is
  not supported. Decorative cushions and accessories are not extra surfaces.
- The four studio desktops have tops at feet Y=0.84. Monitor screens share
  exactly the same boxes for rendering and collision, with tops at Y=1.48.
  Screens are direct mesh children of the camera-obstacle group, alongside
  walls and furniture; decorative monitor stands remain non-colliding.
- `client/src/OfficeWorld.tsx` renders the world, furniture details, room signs,
  floorboards, window accents, plants, and trees.
- `client/src/Office.tsx` retains the existing avatar, networking, and controller;
  its scene mounts `OfficeWorld` and uses warm daylight and a wider camera offset.
- There is deliberately no roof. Front walls and some partitions are cut away
  so the third-person camera can see inside. The entrance is permanently open;
  this update does not introduce door interactions.
- The decorative details do not obstruct the camera or create extra invisible
  collision. Large furniture and structural walls do obstruct the camera.
- Window accents are decorative, not openings. Garden fences are solid.
  Low fences and partitions can be jumped over when the player's feet clear
  their tops. The absolute map boundary still applies at every height.
- Feet Y is capped at 3.5 on the client and server. A jump rises about 1.445,
  allowing full jumps from 2-unit fridge and tree-trunk tops. Jumps from taller
  walls are clipped at the cap. Tree foliage is decorative, not a landable canopy.
- Client and server share bounds of ±23.5 units. The server still validates
  bounds and speed, not furniture or wall collision.
- The central aisle at x=0 is clear from spawn (0, 6) to the north-wall mirror
  approach at (0, -14); no bench detour is needed. The mirror integration uses
  a 3.2-by-2.6 surface centered at (0, 1.6, -15.8), facing south into the hall.

## Verification

From `client/`:

```sh
npm ci
npm run check
npm run build
node scripts/test-world.mjs
npx playwright test tests/physics.spec.ts --grep "desk landing,|bench and planter|vertical sweep"
```

The collision check flood-fills the actual player-sized walkable area and
verifies that every room, garden destination, and north mirror approach is
accessible from spawn. It transpiles the self-contained `world.ts` using the
already installed TypeScript package and imports a JavaScript data URL; no
TypeScript loader or additional dependency is needed. Keep runtime imports out
of `world.ts` unless the script's loading strategy is updated too.

With the stack running, use `OFFICE_URL` to select the correct worktree's URL,
then run `npm run smoke` and `npm run test:e2e`. The world-specific browser test
explicitly selects third-person for world-axis movement, walks through the
entrance, into the studio, then back out past the old bounds.
It saves porch, studio, and garden screenshots under `client/test-results/`.
The first-person physics test walks through the studio doorway to the northern
desk at (-6, -12), lands on its desktop and monitor, and walks off. Short landing
approaches stop inside the browser's WebSocket send tick to avoid test-driver
latency carrying the player past the thin screen.

## Integrating alongside other agents

The source world branch did not modify `App.tsx`, `network.ts`, styles, or avatar
rendering. It is now merged into `updates`, preserving first-person controls,
articulated avatars, jump/punch physics, GIFs, voice, and cameras. The mirror is
mounted at the north end of the hallway. Shared screen geometry keeps monitor
rendering and landing collision aligned. The source worktree remains unchanged.

## Integration validation

- `node scripts/test-world.mjs`: passed, including door-edge radius checks,
  screen-height checks, the mirror approach, and 27,504 reachable sample points.
- The three pure tests in `tests/physics.spec.ts`: passed, covering desktop and
  monitor landings, walking off, bench/planter landings, walls as support,
  jumpable fences, absolute map bounds, thin-surface sweeps, and no mid-air jump.
- Frontend dependency install, type check, and build: passed (Vite retains its
  large-bundle warning).
- Backend race tests and vet: passed using Go 1.26 Docker containers.
- Isolated Compose build/start and network smoke: passed, including room chat,
  leaving, and reconnecting.
- GIF and webcam browser tests plus the combined voice/camera test: four passed
  against the merged stack. The complete regression suite is running separately.
- Physical-GPU performance, real camera/microphone quality, cross-network/TURN
  connectivity, and a manual two-device session remain unverified.
