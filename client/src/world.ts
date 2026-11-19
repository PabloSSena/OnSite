export type Box = {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}

export const walls: Box[] = [
  { position: [0, 1.5, -10], size: [20, 3, 0.3], color: '#527080' },
  { position: [-10, 1.5, 0], size: [0.3, 3, 20], color: '#527080' },
  { position: [10, 1.5, 0], size: [0.3, 3, 20], color: '#527080' },
  { position: [0, 1.5, 10], size: [20, 3, 0.3], color: '#527080' },
]
export const furniture: Box[] = [
  ...[-4, 4].flatMap(x => [-3, 1].map(z => ({
    position: [x, 0.55, z] as [number, number, number],
    size: [2.8, 1.1, 1.5] as [number, number, number], color: '#d6ad80',
  }))),
  { position: [0, 0.45, -7], size: [4, 0.9, 1.4], color: '#a49ade' },
  { position: [7.5, 0.7, -7], size: [1.2, 1.4, 1.2], color: '#64b69b' },
  { position: [-7.5, 0.7, -7], size: [1.2, 1.4, 1.2], color: '#64b69b' },
]

export function blocked(x: number, z: number) {
  const radius = 0.35
  if (Math.abs(x) > 9.45 || Math.abs(z) > 9.45) return true
  return furniture.some(b =>
    Math.abs(x - b.position[0]) < b.size[0] / 2 + radius &&
    Math.abs(z - b.position[2]) < b.size[2] / 2 + radius,
  )
}
