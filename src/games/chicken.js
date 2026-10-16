/**
 * Chicken Cross: hop the chicken across lanes of traffic. Each lane is
 * survived with a fixed chance per difficulty, and the multiplier on lane n is
 * 0.98 / chance^n (a 2% house edge), floored to 2 decimals with exact integers.
 */
export const RTP = 98

export const DIFFICULTIES = {
  easy: { label: 'Easy', lanes: 30, num: 24, den: 25 },
  medium: { label: 'Medium', lanes: 25, num: 22, den: 25 },
  hard: { label: 'Hard', lanes: 22, num: 4, den: 5 },
  daredevil: { label: 'Daredevil', lanes: 18, num: 3, den: 5 },
}
export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES)

export const survival = (difficulty) => DIFFICULTIES[difficulty].num / DIFFICULTIES[difficulty].den

/** Multiplier for reaching lane `lane` (0 is the curb). */
export function multiplier(difficulty, lane) {
  if (lane <= 0) return 1
  const { num, den } = DIFFICULTIES[difficulty]
  const n = BigInt(lane)
  return Number((98n * BigInt(den) ** n) / BigInt(num) ** n) / 100
}

export const laneMultipliers = (difficulty) => Array.from({ length: DIFFICULTIES[difficulty].lanes }, (_, i) => multiplier(difficulty, i + 1))

/** The lane the chicken is hit on (1-based), or null if it would make it all the way. */
export function crashLane(floats, difficulty) {
  const { lanes, num, den } = DIFFICULTIES[difficulty]
  for (let i = 0; i < lanes; i++) if (floats[i] * den >= num) return i + 1
  return null
}
