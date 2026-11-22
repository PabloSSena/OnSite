// A noise gate and normalized amplitude, not phoneme recognition or recording.
export function speechLevel(samples: Float32Array): number {
  if (!samples.length) return 0
  let energy = 0
  for (const sample of samples) {
    if (!Number.isFinite(sample)) return 0
    energy += sample * sample
  }
  const rms = Math.sqrt(energy / samples.length)
  return Math.min(1, Math.max(0, (rms - 0.015) / 0.12))
}

export function advanceMouth(current: number, target: number, dt: number): number {
  const level = Number.isFinite(target) ? Math.min(1, Math.max(0, target)) : 0
  const blend = 1 - Math.exp(-(level > current ? 24 : 14) * Math.max(0, Math.min(dt, 0.1)))
  const next = current + (level - current) * blend
  return level === 0 && next < 0.005 ? 0 : next
}
