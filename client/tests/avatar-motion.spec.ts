import { test, expect } from '@playwright/test'
import { advanceMotion, createMotion, footTarget, legPose, punchExtension } from '../src/avatarMotion'

test('walking phase follows travelled distance at different frame rates', () => {
  const states = [30, 60, 144].map(fps => {
    const state = createMotion()
    for (let frame = 0; frame < fps; frame++) {
      expect(advanceMotion(state, 4 / fps, true, true, 1 / fps)).toBe(state)
    }
    return state
  })
  const expectedPhase = (4 / 1.9 * Math.PI * 2) % (Math.PI * 2)
  for (const state of states) {
    expect(state.phase).toBeCloseTo(expectedPhase, 10)
    expect(state.stride).toBeCloseTo(1 - Math.exp(-12), 10)
    expect(state.air).toBe(0)
  }
})

test('blocked walking keeps phase planted and fades the existing stride', () => {
  const state = createMotion()
  advanceMotion(state, 0.2, true, true, 0.05)
  const phase = state.phase
  const stride = state.stride
  advanceMotion(state, 0, true, true, 1 / 60)
  expect(state.phase).toBe(phase)
  expect(state.stride).toBeGreaterThan(0)
  expect(state.stride).toBeLessThan(stride)
  for (let frame = 0; frame < 120; frame++) advanceMotion(state, 0, true, true, 1 / 60)
  expect(state.phase).toBe(phase)
  expect(state.stride).toBeLessThan(1e-9)
  expect(createMotion()).toEqual({ phase: 0, stride: 0, air: 0, landing: 0, grounded: true })
})

test('stopping eases monotonically into the idle foot pose', () => {
  const state = createMotion()
  for (let frame = 0; frame < 60; frame++) advanceMotion(state, 4 / 60, true, true, 1 / 60)
  const phase = state.phase
  let previous = state.stride
  for (let frame = 0; frame < 120; frame++) {
    advanceMotion(state, 0, true, false, 1 / 60)
    expect(state.stride).toBeGreaterThan(0)
    expect(state.stride).toBeLessThan(previous)
    previous = state.stride
  }
  expect(state.phase).toBe(phase)
  expect(state.stride).toBeLessThan(1e-9)
  for (const side of [-1, 1] as const) {
    expect(footTarget(state, side).y).toBeCloseTo(0.11, 9)
    expect(footTarget(state, side).z).toBeCloseTo(0, 9)
  }
})

test('feet are half a cycle apart and alternate their lifted swing', () => {
  const state = { ...createMotion(), stride: 1 }
  expect(footTarget(state, -1).z).toBeCloseTo(0.15)
  expect(footTarget(state, 1).z).toBeCloseTo(-0.15)
  state.phase = Math.PI / 2
  expect(footTarget(state, -1).y).toBeCloseTo(0.22)
  expect(footTarget(state, 1).y).toBeCloseTo(0.11)
  const leftSwing = footTarget(state, -1)
  state.phase += Math.PI
  expect(footTarget(state, -1).y).toBeCloseTo(0.11)
  expect(footTarget(state, 1).y).toBeCloseTo(leftSwing.y)
  expect(footTarget(state, 1).z).toBeCloseTo(leftSwing.z)
})

test('takeoff blends into tucked legs and landing compression decays', () => {
  const state = createMotion()
  advanceMotion(state, 0, false, false, 1 / 60)
  expect(state.grounded).toBe(false)
  expect(state.air).toBeGreaterThan(0)
  expect(state.air).toBeLessThan(1)
  expect(state.landing).toBe(0)
  expect(footTarget(state, -1).y).toBeGreaterThan(0.11)
  for (let frame = 0; frame < 60; frame++) advanceMotion(state, 0, false, false, 1 / 60)
  expect(state.air).toBeCloseTo(1, 5)
  for (const side of [-1, 1] as const) {
    const foot = footTarget(state, side)
    expect(foot.y).toBeCloseTo(0.26, 5)
    expect(foot.z).toBeCloseTo(0.035, 5)
    expect(Math.abs(legPose(0.58, foot.y, foot.z).knee))
      .toBeGreaterThan(Math.abs(legPose(0.58, 0.11, 0).knee))
  }
  const airborneBlend = state.air
  advanceMotion(state, 0, true, false, 1 / 60)
  expect(state.grounded).toBe(true)
  expect(state.landing).toBe(1)
  expect(state.air).toBeLessThan(airborneBlend)
  let previous = state.landing
  for (let frame = 0; frame < 120; frame++) {
    advanceMotion(state, 0, true, false, 1 / 60)
    expect(state.landing).toBeLessThan(previous)
    previous = state.landing
  }
  expect(state.landing).toBeLessThan(1e-9)
  expect(state.air).toBeLessThan(1e-9)
})

test('leg inverse kinematics reaches feet with two 0.26 segments and level ankles', () => {
  for (const [hipY, footY, footZ] of [[0.58, 0.11, 0], [0.58, 0.22, 0.15], [0.58, 0.18, -0.15]]) {
    const pose = legPose(hipY, footY, footZ)
    const actualY = hipY - 0.26 * Math.cos(pose.hip) - 0.26 * Math.cos(pose.hip + pose.knee)
    const actualZ = -0.26 * Math.sin(pose.hip) - 0.26 * Math.sin(pose.hip + pose.knee)
    expect(actualY).toBeCloseTo(footY, 10)
    expect(actualZ).toBeCloseTo(footZ, 10)
    expect(pose.hip + pose.knee + pose.ankle).toBeCloseTo(0, 10)
  }
  // Unreachable, coincident, and inverted targets must still produce usable rotations.
  for (const target of [[100, 0, 100], [0, 0, 0], [0, 1, -100], [1e300, -1e300, 1e300]]) {
    const pose = legPose(target[0], target[1], target[2])
    expect(Object.values(pose).every(Number.isFinite)).toBe(true)
    expect(pose.hip + pose.knee + pose.ankle).toBeCloseTo(0, 10)
  }
})

test('punch extension is zero at idle and endpoints and peaks halfway', () => {
  expect(punchExtension(0)).toBe(0)
  expect(punchExtension(-1)).toBe(0)
  expect(punchExtension(0.32)).toBe(0)
  expect(punchExtension(1)).toBe(0)
  expect(punchExtension(1e-12)).toBeCloseTo(0, 9)
  expect(punchExtension(0.16)).toBeCloseTo(1, 10)
  expect(punchExtension(0.08)).toBeCloseTo(punchExtension(0.24), 10)
})
