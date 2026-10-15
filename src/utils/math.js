/**
 * Rounds half away from zero to a fixed number of decimal places.
 * Uses exponent notation so values like 1.005 round to 1.01 instead of
 * falling prey to binary floating-point representation (1.00499999...).
 * Non-finite input returns 0 so NaN can never leak into balances.
 */
export function roundTo(value, decimals) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const abs = Math.abs(n)
  if (abs < 1e-12) return 0
  const text = String(abs)
  const rounded = text.includes('e')
    ? Math.round(abs * 10 ** decimals) / 10 ** decimals
    : Number(`${Math.round(Number(`${text}e${decimals}`))}e-${decimals}`)
  const result = n < 0 ? -rounded : rounded
  return result === 0 ? 0 : result
}

/** Dollars, rounded to whole cents. */
export const roundMoney = (value) => roundTo(value, 2)

/** Share quantities, rounded to 4 decimal places. */
export const roundShares = (value) => roundTo(value, 4)

/** Prices, rounded to 4 decimal places (0.0001 dollars). */
export const roundPrice = (value) => roundTo(value, 4)

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/** Adds money values without accumulating floating-point drift. */
export function sumMoney(values) {
  let cents = 0
  for (const v of values) cents += Math.round(roundMoney(v) * 100)
  return roundMoney(cents / 100)
}

export const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
