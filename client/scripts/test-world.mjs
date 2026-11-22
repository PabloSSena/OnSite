import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Exercise the real collision data without a browser or an additional test dependency.
const source = await readFile(new URL('../src/world.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } })
const { blocked, colliders, desks, monitors, seats } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

assert.equal(blocked(0, 6), false, 'spawn is clear')
assert.equal(blocked(1.5, 4), false, 'entrance has room for the player radius')
assert.equal(blocked(1.6, 4), true, 'entrance wall edges include the player radius')
assert.equal(blocked(2, -11), false, 'meeting room doorway is open')
assert.equal(blocked(-2, -11), false, 'studio doorway is open')
assert.equal(blocked(2, -9.2), true, 'doorway edges include the player radius')
assert.equal(blocked(0, -16), true, 'the back wall is solid')
for (let z = -15; z <= 21; z += 0.1) {
  assert.equal(blocked(0, z), false, `the hallway, entrance, and garden path are clear at z=${z}`)
}
for (const obstacle of colliders) {
  assert.equal(blocked(obstacle.position[0], obstacle.position[2]), true, 'visible obstacles block movement')
}
for (const monitor of monitors) {
  const [x, , z] = monitor.position
  assert.equal(blocked(x, z, 0.84), true, 'screen blocks movement across the desktop')
  assert.equal(blocked(x, z, 1.48), false, 'screen top supports standing above its solid body')
}
for (const [x, z] of [[24, 0], [-24, 0], [0, 24], [0, -24], [NaN, 0], [0, Infinity]]) {
  assert.equal(blocked(x, z), true, 'invalid coordinates are blocked')
}

// Flood-fill using actual player-radius collision, not just room bounding rectangles.
const step = 0.25
const queue = [[0, 6]]
const visited = new Set(['0,6'])
for (let i = 0; i < queue.length; i++) {
  const [x, z] = queue[i]
  for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
    const nx = x + dx, nz = z + dz, key = `${nx},${nz}`
    if (!visited.has(key) && !blocked(nx, nz)) {
      visited.add(key)
      queue.push([nx, nz])
    }
  }
}
for (const [name, x, z] of [
  ['studio', -3, -10.5], ['meeting room', 3, -10.5],
  ['lounge', -4, -1], ['kitchen', 4, -1],
  ['picnic area', -10, 15], ['garden lounge', 10, 7], ['raised beds', 15, 18],
  ['west side garden', -20, 6], ['east side garden', 20, 6],
  ['north hallway mirror approach', 0, -14],
]) {
  assert.ok(visited.has(`${x},${z}`), `${name} is reachable from spawn`)
}
// Desks are used by sitting in their chair: seats[i] belongs to desk i, and each
// needs a walkable spot within sitting range (1.3) and server reach of the desk (2.6).
desks.forEach(([x, z], i) => {
  const seat = seats[i]
  assert.ok(Math.abs(seat.x - x) < 0.01 && seat.z > z, `seat ${i} is desk ${i}'s chair`)
  const near = [...visited].some(key => {
    const [px, pz] = key.split(',').map(Number)
    return Math.hypot(px - seat.x, pz - seat.z) <= 1.25
  })
  assert.ok(near, `desk at ${x},${z} has a reachable chair`)
  assert.ok(Math.hypot(seat.x - x, seat.z - z) <= 2.5, `desk ${i}'s chair is within server reach`)
})
console.log(`World collision checks passed; ${visited.size} walkable points connected to spawn.`)
