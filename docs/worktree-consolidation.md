# Worktree consolidation

Target: `office-updates`, branch `updates`. The original `office` / `main`
checkout and all feature worktrees are left unchanged.

## Included features

- Existing `updates` history (`f068d6b`): office house/garden, voice, webcams,
  avatars and appearance, speech motion, jumping/punches, mirror, seats,
  persistent personal desks and wallpapers, kitchen fridge and beers.
- `fix/beer-mouth` (`245ad33`): bottle-rim contact in both camera modes.
- `feature/voice-gifs` (`d80f6dd`): no text chat; paste supported GIF links
  and reuse up to 24 locally saved reactions.
- `feature/mirror-gifs` (`e2591c2`): animated mirror reactions, including
  the local player's GIF in first person.
- The uncommitted `office-hats` source: engineer hard hat, cowboy hat,
  feather headband, safety-yellow palette, persistence and live synchronization.
  The original files remain uncommitted in that worktree.

## Preservation and conflict decisions

Before integration, 62 modified/untracked source files were copied to a
timestamped `office-consolidation-*` directory under the local OpenCode
temporary directory, with content hashes in `manifest.json`. Generated
`server/tmp/` binaries were excluded and left untouched.

- Dirty GIF and webcam worktrees match their previously integrated snapshots
  (`1df4bae` and `72bba41`); newer picker, camera, and protocol behavior is retained.
- Most dirty original-main files match snapshot `1c5af1a` or the newer tree.
  Its later debug-log cleanup is already present; text-chat broadcast changes
  are superseded by the requested text-chat removal.
- Additional original-main `CLAUDE.md` command/architecture guidance is folded
  into the consolidated version, correcting outdated map and text-chat details.
- The older fridge worktree predates seats and desks. Its refrigerator, beer,
  and interaction code is already integrated. Old four-desk geometry and
  debug prints are not reapplied over the newer ten-desk/seating behavior.
- Hat changes are applied to the current avatar without replacing the beer-arm
  fix, first-person layers, or mirror GIF code.
- The fridge browser test retains observed sip events rather than polling only
  the latest short-lived snapshot; movement releases on the outgoing sample.

No branch is reset, no stash is used, and no feature worktree is removed.
`main` is not advanced by this consolidation.

## Consolidated verification

- Frontend `npm ci`, `npm run check`, and `npm run build`: passed.
  The existing large-bundle warning remains.
- Native Go tests/vet and Docker Go `go test -race ./...` / `go vet ./...`: passed.
- Isolated Compose build/start and network smoke at port 8092: passed.
  The first build hit a transient Docker Hub DNS error; the retry succeeded.
- Targeted Playwright: 6 passed across appearance/hat persistence and live
  synchronization, hard-hat mirror/first-person behavior, fridge/sip/drop
  synchronization, and animated mirror GIFs/expiry/decoder cleanup.
- Full regression results will be recorded separately when that run completes.
- Real microphones/cameras, cross-network WebRTC, and physical-GPU performance
  remain manual checks.
