/**
 * Limbo and Crash share one provably fair result: a multiplier from one float.
 *
 *   n = floor(float × 2^24)                    (the first 3 bytes of the HMAC)
 *   result = floor(2^24 × 99 / (n + 1)) / 100  (a 1% house edge)
 *
 * clamped to 1.00× to 1,000,000×. Exact integers, so the server
 * (supabase/schema.sql limbo_result) gets the same answer. The chance that
 * the result reaches x is about 0.99 / x, so any target returns 99%.
 *
 * Limbo: pick a target; you win target × bet when the result reaches it.
 * Crash: the multiplier climbs as e^(GROWTH × ms) and crashes at the result;
 * cash out before that to win bet × the multiplier at that moment.
 */
export const RTP = 99
export const MIN_TARGET = 1.01
export const MAX_RESULT = 1000000
/** Growth per millisecond: 2× after about 11.6 seconds, 10× after 38, 100× after 77. */
export const GROWTH = 0.00006

const SCALE = 16777216 // 2^24

/** Result in hundredths (100 = 1.00×) from one provably fair float. */
export function resultCents(f) {
  const n = Math.floor(f * SCALE)
  const cents = Math.floor((SCALE * 99) / (n + 1))
  return Math.min(MAX_RESULT * 100, Math.max(100, cents))
}

export const resultFromFloat = (f) => resultCents(f) / 100

/** Targets use 2 decimals, from 1.01× to 1,000,000×. */
export const clampTarget = (t) => Math.min(MAX_RESULT, Math.max(MIN_TARGET, Math.round((Number(t) || 0) * 100) / 100))

/** Win chance in percent for a target, rounded to 4 decimals for display. */
export const winChance = (target) => Math.round((RTP / target) * 10000) / 10000

/** Target for a win chance in percent (the inverse, for the chance box). */
export const targetForChance = (chance) => clampTarget(RTP / chance)

export const isWin = (result, target) => Math.round(result * 100) >= Math.round(target * 100)

/** Crash curve: the multiplier after `ms` milliseconds, floored to 2 decimals. */
export const multiplierAt = (ms) => Math.floor(Math.exp(GROWTH * Math.max(0, ms)) * 100) / 100

/** Milliseconds until the curve reaches `mult`. */
export const timeTo = (mult) => Math.log(Math.max(1, mult)) / GROWTH

export const formatMult = (m) => `${m >= 1000 ? Math.floor(m).toLocaleString('en-US') : m.toFixed(2)}×`
