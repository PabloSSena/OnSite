import { Euler, Quaternion, Vector3 } from 'three'

// The top of the bottle's lip, measured from the centre of its body.
export const BEER_RIM_HEIGHT = 0.156
export const BEER_GRIP = 0.235
export const FIRST_PERSON_MOUTH = new Vector3(0, -0.1, -0.1)

export function firstPersonBeerPose(sip: number) {
  const rotation = new Euler(1.4 * sip, 0, 0.95 * sip)
  // Include the bottle's offset within the hand, not just its height.
  const rim = new Vector3(0, 0.06 + BEER_RIM_HEIGHT, -0.01).applyEuler(rotation)
  const contact = FIRST_PERSON_MOUTH.clone().sub(rim)
  const position = new Vector3(0.18, -0.18, -0.65).lerp(contact, sip)
  return { position, rotation }
}

export function beerArmPose(sip: number, swing: number, mouth: Vector3) {
  const tilt = new Quaternion().setFromEuler(new Euler(1.4 * sip, 0, 0.95 * sip))
  const contact = mouth.clone().sub(new Vector3(0, BEER_RIM_HEIGHT, 0).applyQuaternion(tilt))
  // Blend the grip target, then solve both arm joints so the bottle stays in hand.
  const carryShoulder = 0.35 + swing * 0.2
  const carry = new Vector3(0.29,
    0.27 - 0.21 * Math.cos(carryShoulder) - BEER_GRIP * Math.cos(carryShoulder + 1),
    -0.21 * Math.sin(carryShoulder) - BEER_GRIP * Math.sin(carryShoulder + 1))
  const grip = carry.lerp(contact, sip).sub(new Vector3(0.29, 0.27, 0))
  const distance = grip.length()
  const elbow = Math.acos(Math.max(-1, Math.min(1,
    (distance * distance - 0.21 ** 2 - BEER_GRIP ** 2) / (2 * 0.21 * BEER_GRIP))))
  const shoulder = new Euler(
    Math.atan2(Math.hypot(grip.x, grip.z), -grip.y)
      - Math.atan2(BEER_GRIP * Math.sin(elbow), 0.21 + BEER_GRIP * Math.cos(elbow)),
    Math.atan2(-grip.x, -grip.z), 0, 'YXZ')
  const arm = new Quaternion().setFromEuler(shoulder)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), elbow))
  const bottle = arm.invert().multiply(tilt)
  return { shoulder, elbow, bottle }
}
