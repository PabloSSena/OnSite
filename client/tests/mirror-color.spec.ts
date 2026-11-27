import { test, expect } from '@playwright/test'
import { Color, PlaneGeometry } from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { MIRROR_COLOR } from '../src/Mirror'

test('mirror overlay preserves linear skin and clothing colors instead of darkening them', () => {
  const geometry = new PlaneGeometry(1, 1)
  const mirror = new Reflector(geometry, { color: MIRROR_COLOR, multisample: 0 })
  try {
    const tint = mirror.material.uniforms.color.value as Color
    expect(tint.toArray()).toEqual([0.5, 0.5, 0.5])
    // This is Reflector's blendOverlay operation, before output tone mapping.
    const overlay = (base: number, blend: number) =>
      base < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend)
    for (const hex of ['#533528', '#885438', '#efc9a9', '#f7dfcf', '#72baff']) {
      for (const channel of new Color(hex).toArray()) {
        expect(overlay(channel, tint.r)).toBeCloseTo(channel, 12)
      }
    }
    expect(new Color(0x808080).r).toBeLessThan(0.22)
  } finally {
    mirror.dispose()
    geometry.dispose()
  }
})
