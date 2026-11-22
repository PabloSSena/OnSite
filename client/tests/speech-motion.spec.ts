import { test, expect } from '@playwright/test'
import { advanceMouth, speechLevel } from '../src/speechMotion'

test('speech level gates silence and low noise and stays finite and bounded', () => {
  expect(speechLevel(new Float32Array())).toBe(0)
  expect(speechLevel(new Float32Array(512))).toBe(0)
  expect(speechLevel(new Float32Array(512).fill(0.01))).toBe(0)
  expect(speechLevel(new Float32Array(512).fill(0.075))).toBeCloseTo(0.5)
  expect(speechLevel(new Float32Array([1, -1]))).toBe(1)
  expect(speechLevel(new Float32Array([NaN]))).toBe(0)
})

test('mouth follows volume smoothly, closes when silent, and is frame-rate independent', () => {
  const animate = (fps: number) => {
    let level = 0
    for (let i = 0; i < fps / 2; i++) level = advanceMouth(level, 0.8, 1 / fps)
    return level
  }
  expect(animate(30)).toBeCloseTo(animate(60), 10)
  let level = animate(60)
  expect(level).toBeGreaterThan(0.79)
  for (let i = 0; i < 60; i++) {
    const next = advanceMouth(level, 0, 1 / 60)
    expect(next).toBeLessThanOrEqual(level)
    level = next
  }
  expect(level).toBe(0)
  expect(advanceMouth(0, NaN, 1 / 60)).toBe(0)
  expect(advanceMouth(0, 1, 0)).toBe(0)
})
