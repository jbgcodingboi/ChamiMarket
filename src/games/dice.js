/**
 * Dice: a roll from 0.00 to 100.00 (10,001 outcomes). Roll Over wins when the
 * roll is above the target, Roll Under when it is below. The multiplier is
 * 99 / win chance (a 1% house edge), floored to 4 decimals.
 */
export const RTP = 99
export const MIN_TARGET = 2
export const MAX_TARGET = 98

/** Roll in hundredths (0 to 10000) from one provably fair float. */
export const rollFromFloat = (f) => Math.floor(f * 10001)

export const clampTarget = (t) => Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(t * 100) / 100))

/** Win chance in percent for a target (0 to 100) and direction. */
export const winChance = (target, over) => Math.round((over ? 100 - target : target) * 100) / 100

/** Payout multiplier for a win chance in percent. */
export function multiplier(chance) {
  const c = Math.round(chance * 100)
  return c > 0 ? Math.floor(99000000 / c) / 10000 : 0
}

/** Target that gives a multiplier (the inverse of the above, rounded to the slider's 0.01 steps). */
export function targetForMultiplier(mult, over) {
  const chance = Math.round((RTP / mult) * 100) / 100
  return clampTarget(over ? 100 - chance : chance)
}

export const isWin = (roll, target, over) => {
  const t = Math.round(target * 100)
  return over ? roll > t : roll < t
}

export const formatRoll = (roll) => (roll / 100).toFixed(2)
