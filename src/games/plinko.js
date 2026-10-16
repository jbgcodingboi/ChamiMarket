/**
 * Plinko. At each row the ball goes left or right with equal chance, so the
 * bucket is binomially distributed: bucket k of n rows has probability
 * C(n, k) / 2^n. Edge buckets are rare and pay the most. Multiplier tables
 * are tuned to return about 99% of stakes on average for every setting.
 */
import { randomInt } from './random.js'

export const ROW_OPTIONS = [8, 12, 16]
export const RISKS = ['low', 'medium', 'high']

export const MULTIPLIERS = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
}

export function binomial(n, k) {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

export const bucketProbability = (rows, k) => binomial(rows, k) / 2 ** rows

/** Average fraction of the stake returned for a rows/risk setting. */
export const expectedReturn = (rows, risk) =>
  MULTIPLIERS[rows][risk].reduce((sum, m, k) => sum + m * bucketProbability(rows, k), 0)

/** Left (0) / right (1) choice at each row; the bucket is the number of rights. */
export const dropPath = (rows, rand = randomInt) => Array.from({ length: rows }, () => rand(2))

export const bucketOf = (path) => path.reduce((a, b) => a + b, 0)
