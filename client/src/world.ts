export type Box = {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  kind?: 'table' | 'chair'
  // Chairs only: radians around Y, same convention as player rotation (0 faces -Z).
  facing?: number
}

export const WORLD_LIMIT = 23.5
export const PLAYER_RADIUS = 0.35
export const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string): Box =>
  ({ position: [x, y, z], size: [w, h, d], color })
const table = (...args: Parameters<typeof box>): Box => ({ ...box(...args), kind: 'table' })
const chair = (facing: number, ...args: Parameters<typeof box>): Box => ({ ...box(...args), kind: 'chair', facing })
// Shared by rendering and seating: the cushion sits at 55% of the chair height and is 0.12 thick.
export const chairSeatTop = (b: Box) => b.position[1] - b.size[1] / 2 + b.size[1] * 0.55 + 0.06

// Openings are real gaps in the same geometry used for collision.
// The lower front walls keep the fixed third-person camera useful (a dollhouse cutaway).
export const walls: Box[] = [
  box(0, 1.5, -16, 32, 3, 0.3, '#e3d4bb'),
  ...[-16, 16].map(x => box(x, 1.5, -6, 0.3, 3, 20, '#e3d4bb')),
  ...[-9, 9].map(x => box(x, 0.5, 4, 14, 1, 0.3, '#c5b39a')),
  // A central hallway connects all four rooms to the garden entrance.
  ...[-2, 2].flatMap(x => [
    box(x, 1.25, -14, 0.2, 2.5, 4, '#c5b39a'),
    box(x, 1.25, -6, 0.2, 2.5, 6, '#c5b39a'),
    box(x, 0.5, 3, 0.2, 1, 2, '#c5b39a'),
  ]),
  ...[-9, 9].map(x => box(x, 0.6, -6, 14, 1.2, 0.2, '#d5c6ae')),
  // Garden fence: a continuous, visible edge rather than an invisible map boundary.
  ...[-23, 23].map(x => box(x, 0.6, 0, 0.2, 1.2, 46, '#9caa86')),
  ...[-23, 23].map(z => box(0, 0.6, z, 46, 1.2, 0.2, '#9caa86')),
]

// Ten claimable desks: a 3x2 studio grid and two pairs flanking the meeting table.
// Keep in sync with deskPositions in server/desks.go (a Go test checks it).
export const desks = [[-13.4, -12], [-9.2, -12], [-5, -12], [-13.4, -8.5], [-9.2, -8.5], [-5, -8.5], [5, -12], [13.4, -12], [5, -8.5], [13.4, -8.5]] as const
export const trees = [[-20, -17], [20, -17], [-20, -4], [20, -4], [-19, 16], [19, 16], [-9, 20], [9, 20]] as const
export const planters = [[-4, 5.5], [4, 5.5], [-14, 2.8], [14, 2.8]] as const
// Desk tables and chairs collide like any furniture; Desk.tsx renders them with the owner's colors.
export const deskTables: Box[] = desks.map(([x, z]) => table(x, 0.42, z, 2.8, 0.84, 1.5, '#b98253'))
export const deskChairs: Box[] = desks.map(([x, z]) => chair(0, x, 0.4, z + 1.25, 0.8, 0.8, 0.75, '#59796c'))
export const sharedFurniture: Box[] = [
  table(9, 0.42, -11, 2.6, 0.84, 2.3, '#b98253'),
  ...[8.3, 9.7].flatMap(x => [-13, -9].map(z => chair(z < -11 ? Math.PI : 0, x, 0.4, z, 0.6, 0.8, 0.7, '#ae7964'))),
  // Lounge sofas: seat height close to the chairs so avatars can sit on them.
  box(-11, 0.275, -2.8, 6, 0.55, 1.5, '#708d77'),
  box(-14, 0.275, -0.5, 1.5, 0.55, 3, '#708d77'),
  table(-9, 0.22, 0, 2.8, 0.44, 1.6, '#b98253'),
  box(-5, 0.4, 1, 1.5, 0.8, 1.5, '#c38a58'),
  box(10, 0.55, -4.9, 9, 1.1, 1.4, '#718476'),
  box(14.6, 1, -2.8, 1.4, 2, 1.4, '#e4dfd3'),
  table(8.5, 0.48, 0, 3.8, 0.96, 1.7, '#b98253'),
  ...[6.8, 8.5, 10.2].map(x => chair(0, x, 0.35, 1.6, 0.7, 0.7, 0.7, '#d2ad6a')),
  // Outdoor picnic table and benches, off the clear entrance path.
  table(-10, 0.45, 11, 4.5, 0.9, 2, '#b98253'),
  ...[9.2, 12.8].map(z => box(-10, 0.25, z, 4.5, 0.5, 0.6, '#b98253')),
  box(10, 0.3, 13, 4.6, 0.6, 1.4, '#7d9988'),
  box(13.3, 0.3, 10.5, 1.4, 0.6, 4.6, '#7d9988'),
  box(9.5, 0.25, 10, 1.5, 0.5, 1.5, '#c29c70'),
  ...trees.map(([x, z]) => box(x, 1, z, 0.7, 2, 0.7, '#806147')),
  ...planters.map(([x, z]) => box(x, 0.4, z, 1.1, 0.8, 1.1, '#ad7658')),
]
export const furniture: Box[] = [...deskTables, ...deskChairs, ...sharedFurniture]

export type Seat = { x: number; z: number; height: number; facing: number }
const seatRow = (xs: number[], z: number, height: number, facing: number) =>
  xs.map(x => ({ x, z, height, facing }))
const seatColumn = (x: number, zs: number[], height: number, facing: number) =>
  zs.map(z => ({ x, z, height, facing }))
// Seat points lie inside furniture colliders; seated players skip collision.
// `height` is the cushion top the hips rest on. Points sit near the front edge
// so the shins (0.26 below the knee, 0.26 ahead of the hips) hang clear of the seat.
const chairForward = 0.15
export const seats: Seat[] = [
  ...furniture.filter(b => b.kind === 'chair').map(b => {
    const facing = b.facing ?? 0
    return {
      x: b.position[0] - Math.sin(facing) * chairForward,
      z: b.position[2] - Math.cos(facing) * chairForward,
      height: chairSeatTop(b), facing,
    }
  }),
  ...seatRow([-12.7, -10.9, -9.1], -2.35, 0.55, Math.PI), // lounge sofa
  ...seatColumn(-13.55, [-1.2, 0.2], 0.55, -Math.PI / 2), // lounge side sofa
  ...seatRow([-11.5, -10, -8.5], 9.25, 0.5, Math.PI), // picnic bench, house side
  ...seatRow([-11.5, -10, -8.5], 12.75, 0.5, 0), // picnic bench, fence side
  ...seatRow([8.8, 10, 11.2], 12.55, 0.6, 0), // garden sofa
  ...seatColumn(12.85, [9.2, 10.4, 11.6], 0.6, Math.PI / 2), // garden sofa, short side
]

export function nearestSeat(x: number, z: number, maxDistance = 1.3) {
  let best: Seat | null = null
  let bestDistance = maxDistance
  for (const seat of seats) {
    const distance = Math.hypot(seat.x - x, seat.z - z)
    if (distance <= bestDistance) {
      best = seat
      bestDistance = distance
    }
  }
  return best
}

// The seat a player occupies: used by avatars to find hip height.
export const seatAt = (x: number, z: number) => nearestSeat(x, z, 0.3)

// Screen geometry is shared by rendering and height-aware collision.
export const monitors: Box[] = desks.map(([x, z]) =>
  box(x, 1.18, z - 0.25, 1.1, 0.6, 0.09, '#384f50'))
export const colliders = [...walls, ...furniture, ...monitors]
export const playerRadius = PLAYER_RADIUS
export const playerHeight = 1.55
export const maxFeetHeight = 3.5
const gravity = 16
const jumpVelocity = 6.8
const epsilon = 1e-7

function overlaps(x: number, z: number, b: Box) {
  return Math.abs(x - b.position[0]) < b.size[0] / 2 + playerRadius &&
    Math.abs(z - b.position[2]) < b.size[2] / 2 + playerRadius
}

export function blocked(x: number, z: number, y = 0, boxes = colliders) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) return true
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return true
  return boxes.some(b => overlaps(x, z, b) &&
    y < b.position[1] + b.size[1] / 2 - epsilon &&
    y + playerHeight > b.position[1] - b.size[1] / 2 + epsilon,
  )
}

export type PhysicsState = { x: number; y: number; z: number; velocity: number }

export function supported({ x, y, z }: Pick<PhysicsState, 'x' | 'y' | 'z'>, boxes = colliders) {
  return y <= epsilon || boxes.some(b => overlaps(x, z, b) &&
    Math.abs(y - (b.position[1] + b.size[1] / 2)) < epsilon)
}

// Feet Y is authoritative. Sweep the body against tops/undersides rather than
// testing only the final height, so a slow frame cannot tunnel through a surface.
export function verticalStep(state: PhysicsState, dt: number, boxes = colliders): PhysicsState {
  const { x, y, z } = state
  let nextY = y + state.velocity * dt - gravity * dt * dt / 2
  let velocity = state.velocity - gravity * dt
  if (nextY <= y) {
    let floor = 0
    for (const b of boxes) {
      const top = b.position[1] + b.size[1] / 2
      if (overlaps(x, z, b) && y >= top - epsilon && nextY <= top) floor = Math.max(floor, top)
    }
    if (nextY <= floor) {
      nextY = floor
      velocity = 0
    }
  } else {
    let ceiling = maxFeetHeight
    for (const b of boxes) {
      const bottom = b.position[1] - b.size[1] / 2
      if (overlaps(x, z, b) && y + playerHeight <= bottom + epsilon &&
        nextY + playerHeight >= bottom) ceiling = Math.min(ceiling, bottom - playerHeight)
    }
    if (nextY >= ceiling) {
      nextY = ceiling
      velocity = 0
    }
  }
  return { x, y: nextY, z, velocity }
}

// Pure simulation shared by the render loop and regression tests. Short steps
// preserve solid sides while moving diagonally or leaving a support surface.
export function stepPhysics(state: PhysicsState, dx: number, dz: number, dt: number, jump = false, boxes = colliders): PhysicsState {
  let next = { ...state }
  if (jump && supported(next, boxes)) next.velocity = jumpVelocity
  const steps = Math.max(1, Math.ceil(dt * 120), Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.1))
  for (let i = 0; i < steps; i++) {
    next = verticalStep(next, dt / steps, boxes)
    if (!blocked(next.x + dx / steps, next.z, next.y, boxes)) next.x += dx / steps
    if (!blocked(next.x, next.z + dz / steps, next.y, boxes)) next.z += dz / steps
  }
  return next
}

// Desk chairs come first in `furniture`, so seats[i] is desk i's chair for i < desks.length.
export function deskOfSeat(seat: Seat | null): number | null {
  const index = seat ? seats.indexOf(seat) : -1
  return index >= 0 && index < desks.length ? index : null
}
