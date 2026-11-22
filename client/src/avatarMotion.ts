const tau = Math.PI * 2
const damp = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-rate * dt))

export type MotionState = {
  phase: number
  stride: number
  air: number
  landing: number
  grounded: boolean
}

export function createMotion(): MotionState {
  return { phase: 0, stride: 0, air: 0, landing: 0, grounded: true }
}

// Advance from distance actually travelled, not a held movement key. A blocked
// avatar stays planted; stopping eases the limbs back to their resting pose.
export function advanceMotion(state: MotionState, distance: number, grounded: boolean, walking: boolean, dt: number) {
  if (dt <= 0) return state
  const step = Math.min(dt, 0.1)
  const travelled = distance > 0.6 ? 0 : Math.max(0, distance)
  const moving = grounded && walking
  if (moving) state.phase = (state.phase + travelled / 1.9 * tau) % tau
  state.stride = damp(state.stride, moving ? Math.min(1, travelled / dt / 4) : 0, 12, step)
  state.air = damp(state.air, grounded ? 0 : 1, 14, step)
  state.landing = !state.grounded && grounded ? 1 : damp(state.landing, 0, 16, step)
  state.grounded = grounded
  return state
}

export function footTarget(state: MotionState, side: -1 | 1) {
  const phase = state.phase + (side === 1 ? Math.PI : 0)
  const stride = state.stride * (1 - state.air)
  return {
    y: 0.11 + Math.max(0, Math.sin(phase)) * 0.11 * stride + state.air * 0.15,
    z: Math.cos(phase) * 0.15 * stride + state.air * 0.035,
  }
}

// Two short leg segments keep planted boots level while the hips bounce. The
// knee bends forward; the ankle cancels the thigh/shin rotation.
export function legPose(hipY: number, footY: number, footZ: number) {
  const length = 0.26
  const down = hipY - footY
  const distance = Math.max(0.01, Math.min(length * 2 - 0.001, Math.hypot(down, footZ)))
  const bend = Math.acos(Math.min(1, Math.max(-1, distance / (length * 2))))
  const hip = Math.atan2(-footZ, down) + bend
  const knee = -2 * bend
  return { hip, knee, ankle: -hip - knee }
}

// Standing hip pivot height and how far above a cushion the seated pivot rests.
export const STANDING_HIP = 0.58
export const SEATED_HIP_LIFT = 0.1

export const easeSit = (blend: number, seated: boolean, dt: number) =>
  damp(blend, seated ? 1 : 0, 10, Math.min(dt, 0.1))

// Blend from the standing pose toward a seated one: thighs level and forward,
// shins hanging straight down, boots level.
export function sitPose(pose: ReturnType<typeof legPose>, blend: number) {
  const hip = pose.hip + (Math.PI / 2 - pose.hip) * blend
  const knee = pose.knee + (-Math.PI / 2 - pose.knee) * blend
  return { hip, knee, ankle: -hip - knee }
}

export function punchExtension(remaining: number) {
  return remaining > 0 ? Math.sin(Math.PI * (1 - Math.min(0.32, remaining) / 0.32)) : 0
}
