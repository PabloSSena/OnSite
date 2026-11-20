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

export const monitors: Box[] = furniture.slice(0, 4).map(b => ({
  position: [b.position[0], 1.45, b.position[2] - 0.25],
  size: [0.9, 0.6, 0.08], color: '#243b50',
}))
export const colliders = [...furniture, ...monitors]
export const playerRadius = 0.35
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
  if (Math.abs(x) > 9.45 || Math.abs(z) > 9.45) return true
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
