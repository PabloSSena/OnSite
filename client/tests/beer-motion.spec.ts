import { test, expect } from '@playwright/test'
import { Euler, Group, Vector3 } from 'three'
import { BEER_GRIP, BEER_RIM_HEIGHT, beerArmPose, FIRST_PERSON_MOUTH, firstPersonBeerPose } from '../src/beerMotion'
import { sipLift } from '../src/avatarMotion'

test('first-person sip puts the rim at the mouth, not out in front of the eyes', () => {
  const pose = firstPersonBeerPose(1)
  const rim = new Vector3(0, 0.06 + BEER_RIM_HEIGHT, -0.01)
    .applyEuler(pose.rotation).add(pose.position)
  expect(rim.distanceTo(FIRST_PERSON_MOUTH)).toBeLessThan(1e-10)
  expect(pose.position.z).toBeLessThan(rim.z)
  expect(firstPersonBeerPose(0).position.toArray()).toEqual([0.18, -0.18, -0.65])
})

test('avatar arm keeps its grip and reaches the animated mouth throughout the sip hold', () => {
  for (const nod of [-0.015, 0, 0.015]) {
    const mouth = new Vector3(0, -0.07, -0.218)
      .applyEuler(new Euler(nod, 0.08, -0.025)).add(new Vector3(0, 0.55, -0.015))
    for (const swing of [-0.5, 0, 0.5]) {
      const pose = beerArmPose(1, swing, mouth)
      const shoulder = new Group()
      shoulder.position.set(0.29, 0.27, 0)
      shoulder.rotation.copy(pose.shoulder)
      const elbow = new Group()
      elbow.position.y = -0.21
      elbow.rotation.x = pose.elbow
      shoulder.add(elbow)
      const bottle = new Group()
      bottle.position.y = -BEER_GRIP
      bottle.quaternion.copy(pose.bottle)
      elbow.add(bottle)
      shoulder.updateMatrixWorld(true)
      const rim = bottle.localToWorld(new Vector3(0, BEER_RIM_HEIGHT, 0))
      expect(rim.distanceTo(mouth)).toBeLessThan(1e-10)
      expect(bottle.position.y).toBe(-BEER_GRIP)
    }
  }
})

test('sip raises, holds contact, and returns to the carry pose without invalid joints', () => {
  expect(sipLift(1.2)).toBe(0)
  expect(sipLift(0.8)).toBe(1)
  expect(sipLift(0.5)).toBe(1)
  expect(sipLift(0)).toBe(0)
  const mouth = new Vector3(0, 0.48, -0.233)
  for (let frame = 0; frame <= 120; frame++) {
    const sip = sipLift(1.2 - frame / 100)
    const pose = beerArmPose(sip, 0.5, mouth)
    expect([...pose.shoulder.toArray().slice(0, 3), pose.elbow, ...pose.bottle.toArray()]
      .every(value => typeof value === 'number' && Number.isFinite(value))).toBe(true)
  }
})
