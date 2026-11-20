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

- `client/src/world.ts` owns the solid wall and furniture boxes. Movement uses
  those bounding dimensions, expanded by the player's 0.35-unit radius. Tables
  and chairs have thinner tops, seats, and legs within their collision bounds.
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
- Client and server share bounds of ±23.5 units. The server still validates
  bounds and speed, not furniture or wall collision.

## Verification

From `client/`:

```sh
npm ci
npm run check
npm run build
node scripts/test-world.mjs
```

The collision check flood-fills the actual player-sized walkable area and
verifies that every room and garden destination is accessible from spawn.

With the stack running, use `OFFICE_URL` to select the correct worktree's URL,
then run `npm run smoke` and `npm run test:e2e`. The world-specific browser test
walks through the entrance, into the studio, then back out past the old bounds.
It saves porch, studio, and garden screenshots under `client/test-results/`.

## Integrating alongside other agents

This work does not modify `App.tsx`, `network.ts`, styles, or avatar rendering.
Keep other agents' controller and camera-mode changes when merging
`Office.tsx`; the world-related changes are its imports, camera offset, lighting,
scene geometry, and camera far plane. The backend change is just the map-bound
constant in `validMove`; preserve unrelated backend edits.

## Known baseline issue

The starting commit's Leave button in `App.tsx` calls `setJoined(true)` rather
than `setJoined(false)`. Consequently the existing two-tab browser test fails
its final leave assertion even though movement and chat succeed. This unrelated
UI issue is deliberately not changed here to avoid overlapping another agent's
work. The network smoke test verifies that socket-level leave/reconnection works.

## Validation results

- `npm ci`, `npm run check`, and `npm run build`: passed. Vite reports its
  large-bundle warning; no new dependencies were introduced.
- `node scripts/test-world.mjs`: passed, including door-edge radius checks and
  27,504 reachable sample points.
- `go test -race ./...` and `go vet ./...`: passed in the `golang:1.26` Docker
  image (Go is not installed on the Windows host).
- Isolated Compose project `office-world`, exposed on port 8084: built and started.
- Network smoke test against port 8084: passed health, join, movement, chat
  identity, leave, and reconnect.
- World browser test: passed a networked walk from the porch into the studio and
  back out beyond the old map bounds. Its original 20-second movement timeout was
  too short for this machine's software renderer; the test now allows 90 seconds
  per leg and includes live coordinates in failure output.
- Existing two-tab browser test: movement and chat passed; final leave assertion
  failed because of the baseline UI bug above.
- Porch, studio, and garden screenshots were inspected. Physical-GPU performance
  and a manual two-person session remain unverified.
