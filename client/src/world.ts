export type Box = {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  kind?: 'table' | 'chair'
}

export const WORLD_LIMIT = 23.5
export const PLAYER_RADIUS = 0.35
export const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string): Box =>
  ({ position: [x, y, z], size: [w, h, d], color })
const table = (...args: Parameters<typeof box>): Box => ({ ...box(...args), kind: 'table' })
const chair = (...args: Parameters<typeof box>): Box => ({ ...box(...args), kind: 'chair' })

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

export const desks = [[-12, -12], [-6, -12], [-12, -8.5], [-6, -8.5]] as const
export const trees = [[-20, -17], [20, -17], [-20, -4], [20, -4], [-19, 16], [19, 16], [-9, 20], [9, 20]] as const
export const planters = [[-4, 5.5], [4, 5.5], [-14, 2.8], [14, 2.8]] as const
export const furniture: Box[] = [
  ...desks.map(([x, z]) => table(x, 0.42, z, 3.2, 0.84, 1.5, '#b98253')),
  ...desks.map(([x, z]) => chair(x, 0.4, z + 1.25, 0.8, 0.8, 0.75, '#59796c')),
  table(9, 0.42, -11, 5.5, 0.84, 2.3, '#b98253'),
  ...[6.8, 9, 11.2].flatMap(x => [-13, -9].map(z => chair(x, 0.4, z, 0.8, 0.8, 0.8, '#ae7964'))),
  box(-11, 0.45, -2.8, 6, 0.9, 1.5, '#708d77'),
  box(-14, 0.45, -0.5, 1.5, 0.9, 3, '#708d77'),
  table(-9, 0.22, 0, 2.8, 0.44, 1.6, '#b98253'),
  box(-5, 0.4, 1, 1.5, 0.8, 1.5, '#c38a58'),
  box(10, 0.55, -4.9, 9, 1.1, 1.4, '#718476'),
  box(14.6, 1, -2.8, 1.4, 2, 1.4, '#e4dfd3'),
  table(8.5, 0.48, 0, 3.8, 0.96, 1.7, '#b98253'),
  ...[6.8, 8.5, 10.2].map(x => chair(x, 0.35, 1.6, 0.7, 0.7, 0.7, '#d2ad6a')),
  // Outdoor picnic table and benches, off the clear entrance path.
  table(-10, 0.45, 11, 4.5, 0.9, 2, '#b98253'),
  ...[9.2, 12.8].map(z => box(-10, 0.25, z, 4.5, 0.5, 0.6, '#b98253')),
  box(10, 0.3, 13, 4.6, 0.6, 1.4, '#7d9988'),
  box(13.3, 0.3, 10.5, 1.4, 0.6, 4.6, '#7d9988'),
  box(9.5, 0.25, 10, 1.5, 0.5, 1.5, '#c29c70'),
  ...trees.map(([x, z]) => box(x, 1, z, 0.7, 2, 0.7, '#806147')),
  ...planters.map(([x, z]) => box(x, 0.4, z, 1.1, 0.8, 1.1, '#ad7658')),
]

const colliders = [...walls, ...furniture]

export function blocked(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return true
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return true
  return colliders.some(b =>
    Math.abs(x - b.position[0]) < b.size[0] / 2 + PLAYER_RADIUS &&
    Math.abs(z - b.position[2]) < b.size[2] / 2 + PLAYER_RADIUS,
  )
}
