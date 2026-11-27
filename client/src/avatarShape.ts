import { Shape, Vector3 } from 'three'

// Option 04: a floating oval head, rounded triangle, small blocks, and slim arms.
// Coordinates are torso-local; the hip pivot stays compatible with seats/camera.
export const BODY_WIDTH = 0.88
export const BODY_HEIGHT = 0.95
export const BODY_DEPTH = 0.26
export const BODY_DROP = 0.44
export const HEAD_CENTER = new Vector3(0, 1.31, -0.015)
export const MOUTH = new Vector3(0, -0.075, -0.194)
export const SHOULDER = new Vector3(0.23, 0.74, -0.06)
export const UPPER_ARM = 0.28
export const HAND_GRIP = 0.32
export const HAT_SCALE = [0.84, 0.92, 0.84] as const

export function triangleBodyShape() {
  const shape = new Shape()
  shape.moveTo(0, BODY_HEIGHT)
  shape.bezierCurveTo(BODY_WIDTH * 0.22, BODY_HEIGHT * 1.03,
    BODY_WIDTH * 0.40, BODY_HEIGHT * 0.47, BODY_WIDTH * 0.49, BODY_HEIGHT * 0.045)
  shape.bezierCurveTo(BODY_WIDTH * 0.50, 0, BODY_WIDTH * 0.47, 0, BODY_WIDTH * 0.43, 0)
  shape.bezierCurveTo(BODY_WIDTH * 0.15, -0.008, -BODY_WIDTH * 0.15, -0.008, -BODY_WIDTH * 0.43, 0)
  shape.bezierCurveTo(-BODY_WIDTH * 0.47, 0, -BODY_WIDTH * 0.50, 0, -BODY_WIDTH * 0.49, BODY_HEIGHT * 0.045)
  shape.bezierCurveTo(-BODY_WIDTH * 0.40, BODY_HEIGHT * 0.47,
    -BODY_WIDTH * 0.22, BODY_HEIGHT * 1.03, 0, BODY_HEIGHT)
  shape.closePath()
  return shape
}

// Shorten the lower triangle on a chair without moving the head/camera upward.
export function seatedShape(blend: number) {
  return {
    drop: -BODY_DROP * (1 - blend),
    height: 1 - BODY_DROP / BODY_HEIGHT * blend,
    upperOffset: BODY_DROP * blend,
  }
}
