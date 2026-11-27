import { test, expect } from '@playwright/test'
import { ExtrudeGeometry } from 'three'
import { BODY_DEPTH, BODY_DROP, BODY_HEIGHT, BODY_WIDTH, HAT_SCALE, HEAD_CENTER, seatedShape, triangleBodyShape } from '../src/avatarShape'
import { defaultAppearance } from '../src/appearance'
import { STANDING_HIP } from '../src/avatarMotion'
import { speechHeadOffset } from '../src/speechMotion'

test('option 04 has a rounded triangle, a floating head, and tiny ground-level legs', () => {
  const geometry = new ExtrudeGeometry(triangleBodyShape(), { depth: BODY_DEPTH, bevelEnabled: false, curveSegments: 20 })
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  expect(box.max.x - box.min.x).toBeGreaterThan(BODY_WIDTH * 0.95)
  expect(box.max.y).toBeCloseTo(BODY_HEIGHT, 2)
  expect(box.max.z - box.min.z).toBeCloseTo(BODY_DEPTH, 6)
  expect(HEAD_CENTER.y - 0.205 * 1.12 - box.max.y).toBeGreaterThan(0.1)
  expect(STANDING_HIP - BODY_DROP - 0.13).toBeCloseTo(0.01)
  expect(HAT_SCALE[0] * 0.246).toBeCloseTo(0.205, 2)
  expect(HAT_SCALE[1] * 0.25).toBeCloseTo(0.205 * 1.12, 2)
  geometry.dispose()
})

test('sitting shortens the lower body without lifting the head or shoulders relative to the hip', () => {
  const standingHead = -BODY_DROP + HEAD_CENTER.y
  for (const blend of [0, 0.25, 0.5, 0.75, 1]) {
    const pose = seatedShape(blend)
    expect(pose.drop + HEAD_CENTER.y - pose.upperOffset).toBeCloseTo(standingHead, 8)
    expect(pose.drop + BODY_HEIGHT * pose.height).toBeCloseTo(BODY_HEIGHT - BODY_DROP, 8)
  }
})

test('fresh appearances use the reference silhouette without removing existing hat choices', () => {
  const appearance = defaultAppearance()
  expect(appearance.hair).toBe('none')
  expect(appearance.backpack).toBe(false)
  expect(appearance.face).toBe('neutral')
  expect(appearance.hat).toBe('none')
})

test('the bottom of the talking dip reaches the neck without sinking into the rounded body', () => {
  const lowestHead = HEAD_CENTER.y + speechHeadOffset(1, Math.PI / 36)
  const clearance = lowestHead - 0.205 * 1.12 - BODY_HEIGHT
  expect(clearance).toBeGreaterThan(0.018)
  expect(clearance).toBeLessThan(0.03)
})
