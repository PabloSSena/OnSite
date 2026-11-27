import { test, expect } from '@playwright/test'
import { advanceMouth, speechHeadOffset, speechLevel } from '../src/speechMotion'

test('speech level gates silence and low noise and stays finite and bounded', () => {
  expect(speechLevel(new Float32Array())).toBe(0)
  expect(speechLevel(new Float32Array(512))).toBe(0)
  expect(speechLevel(new Float32Array(512).fill(0.01))).toBe(0)
  expect(speechLevel(new Float32Array(512).fill(0.075))).toBeCloseTo(0.5)
  expect(speechLevel(new Float32Array([1, -1]))).toBe(1)
  expect(speechLevel(new Float32Array([NaN]))).toBe(0)
})

test('speech dips toward the neck, never above the normal head position, and rests in silence', () => {
  const heights: number[] = []
  for (let i = 0; i < 120; i++) {
    const time = i / 60
    const height = speechHeadOffset(1, time)
    heights.push(height)
    expect(height).toBeGreaterThanOrEqual(-0.11)
    expect(height).toBeLessThanOrEqual(0)
    expect(speechHeadOffset(0, time)).toBe(0)
    expect(speechHeadOffset(0.5, time)).toBeCloseTo(height / 2, 12)
    expect(speechHeadOffset(1, time, 1)).toBe(0)
    expect(speechHeadOffset(1, time, 0.5)).toBeCloseTo(height / 2, 12)
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.10)
  let volume = 1
  for (let i = 0; i < 120; i++) volume = advanceMouth(volume, 0, 1 / 60)
  expect(speechHeadOffset(volume, 2)).toBe(0)
  expect(speechHeadOffset(NaN, 0)).toBe(0)
  expect(Number.isFinite(speechHeadOffset(Infinity, Infinity, NaN))).toBe(true)
  expect(speechHeadOffset(1, Math.PI / 36)).toBeCloseTo(-0.11)
  expect(speechHeadOffset(1, Math.PI / 12)).toBeCloseTo(0)
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
