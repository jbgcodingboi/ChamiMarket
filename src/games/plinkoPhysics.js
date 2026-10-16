import { randomFloat } from './random.js'

/*
 * Geometry is in units of the pin spacing; y grows downward from the first
 * pin row. Row r has r + 3 pins and the board ends in rows + 1 buckets.
 */
export const ROW_H = 0.9
export const PIN_R = 0.11
export const BALL_R = 0.21
const CONTACT = PIN_R + BALL_R
export const GRAVITY = 120
export const DROP_FROM = -1.1
export const BUCKET_GAP = 0.95
export const BUCKET_H = 0.72
export const widthUnits = (rows) => rows + 3
export const heightUnits = (rows) => -DROP_FROM + 0.4 + (rows - 1) * ROW_H + BUCKET_GAP + BUCKET_H + 0.25
export const bucketTop = (rows) => (rows - 1) * ROW_H + BUCKET_GAP
export const pinX = (row, j) => j - (row + 2) / 2

/**
 * Flight plan for a ball that follows a left/right path: a free fall onto the
 * top pin, then one ballistic hop per row (a small upward bounce, gravity,
 * and half a pin spacing sideways) and a last hop into the bucket.
 */
export function flightPlan(path, rand = randomFloat) {
  const rows = path.length
  const segments = []
  const fall = -CONTACT - DROP_FROM
  segments.push({ x0: 0, y0: DROP_FROM, vx: 0, vy: 0, T: Math.sqrt((2 * fall) / GRAVITY), hit: { row: 0, j: 1 } })
  let x = 0
  let rights = 0
  for (let r = 0; r < rows; r++) {
    const dir = path[r] ? 1 : -1
    const y0 = r * ROW_H - CONTACT
    const last = r === rows - 1
    const dy = last ? bucketTop(rows) + 0.2 - y0 : ROW_H
    const bounce = Math.sqrt(2 * GRAVITY * (0.1 + 0.12 * rand()))
    const T = (bounce + Math.sqrt(bounce * bounce + 2 * GRAVITY * dy)) / GRAVITY
    rights += path[r]
    segments.push({ x0: x, y0, vx: (dir * 0.5) / T, vy: -bounce, T, hit: last ? null : { row: r + 1, j: rights + 1 } })
    x += dir * 0.5
  }
  let t = 0
  for (const s of segments) {
    s.t0 = t
    t += s.T
  }
  return { segments, duration: t, bucket: rights }
}
