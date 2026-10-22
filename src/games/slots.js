/**
 * Golden Sevens: a classic 5-reel, 3-row slot with 20 paylines.
 *
 * Every spin is drawn from provably fair floats, FLOATS_PER_SPIN per spin, so
 * the server (supabase/schema.sql slot_round) and this file produce the same
 * round from the same seeds. All money math is in integer "units" of a
 * hundredth of the total bet (a line bet is 5 units), so both agree to the cent.
 *
 * - Line wins pay left to right from reel 1 for 3, 4 or 5 matching symbols.
 * - Wilds (reels 2 to 4) stand in for any symbol except the scatter and carry
 *   a 2x, 3x, 5x or 10x multiplier. Wild multipliers on a line multiply.
 * - 3, 4 or 5 scatters anywhere pay 2x, 10x or 50x the bet and start 10, 15
 *   or 20 free spins. Free spins pay triple and can retrigger (30 at most).
 * - A round never pays more than 50,000x the bet.
 */
export const REELS = 5
export const ROWS = 3
export const LINE_COUNT = 20
export const FLOATS_PER_SPIN = 24
export const MAX_FREE_SPINS = 30
export const FLOAT_COUNT = (1 + MAX_FREE_SPINS) * FLOATS_PER_SPIN
export const FREE_SPIN_MULT = 3
export const CAP_X = 50000
const CAP_UNITS = CAP_X * 100
const LINE_UNITS = 100 / LINE_COUNT

/** The 20 paylines: the row (0 top, 2 bottom) on each reel. */
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2], [1, 0, 1, 0, 1], [1, 2, 1, 2, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 2, 2, 2, 0],
]

export const PAYING = ['cherry', 'lemon', 'orange', 'plum', 'bell', 'bar', 'seven', 'diamond']
/** Pay for 3, 4 and 5 of a kind on a line, in line bets. */
export const PAY = {
  cherry: [2, 6, 20],
  lemon: [2, 6, 20],
  orange: [3, 10, 35],
  plum: [3, 10, 35],
  bell: [6, 20, 90],
  bar: [10, 35, 175],
  seven: [18, 90, 500],
  diamond: [40, 250, 3000],
}
/** Scatter pays for 3, 4 and 5 anywhere, in total bets, and the free spins they start. */
export const SCATTER_PAY = [2, 10, 50]
export const SCATTER_SPINS = [10, 15, 20]

const table = (pairs) => ({ symbols: pairs.map((p) => p[0]), weights: pairs.map((p) => p[1]), total: pairs.reduce((s, p) => s + p[1], 0) })

/** Symbol odds per cell: the outer reels (1 and 5) and the middle reels (2 to 4, where wilds land). */
export const OUTER = table([['cherry', 20], ['lemon', 18], ['orange', 16], ['plum', 14], ['bell', 10], ['bar', 7], ['seven', 4], ['diamond', 2], ['scatter', 3]])
export const MIDDLE = table([['cherry', 20], ['lemon', 18], ['orange', 16], ['plum', 14], ['bell', 10], ['bar', 7], ['seven', 4], ['diamond', 2], ['wild', 5], ['scatter', 3]])
export const WILD_MULT = table([[2, 56], [3, 27], [5, 13], [10, 4]])

/** Weighted pick with one float. floor(f x total) is exact for these small totals, here and in Postgres. */
export function pick(f, t) {
  let r = Math.floor(f * t.total)
  for (let i = 0; i < t.weights.length; i++) {
    r -= t.weights[i]
    if (r < 0) return t.symbols[i]
  }
  return t.symbols[t.symbols.length - 1]
}

/**
 * One spin from floats[at .. at + FLOATS_PER_SPIN): cells 0-14 (reel x 3 + row),
 * then a multiplier float for each middle-reel cell. `free` spins pay triple.
 */
export function spin(floats, at, free = false) {
  const grid = []
  const mults = []
  for (let r = 0; r < REELS; r++) {
    const col = []
    const m = []
    for (let row = 0; row < ROWS; row++) {
      const sym = pick(floats[at + r * ROWS + row], r === 0 || r === 4 ? OUTER : MIDDLE)
      col.push(sym)
      m.push(sym === 'wild' ? pick(floats[at + 15 + (r - 1) * ROWS + row], WILD_MULT) : 1)
    }
    grid.push(col)
    mults.push(m)
  }

  const wins = []
  let units = 0
  LINES.forEach((line, li) => {
    const first = grid[0][line[0]]
    if (first === 'scatter') return
    let count = 1
    let mult = 1
    for (let r = 1; r < REELS; r++) {
      const sym = grid[r][line[r]]
      if (sym !== first && sym !== 'wild') break
      if (sym === 'wild') mult *= mults[r][line[r]]
      count++
    }
    if (count < 3) return
    const win = PAY[first][count - 3] * LINE_UNITS * mult
    wins.push({ line: li, symbol: first, count, mult, units: win })
    units += win
  })

  const scatters = grid.flat().filter((s) => s === 'scatter').length
  const scatterUnits = scatters >= 3 ? SCATTER_PAY[Math.min(scatters, 5) - 3] * 100 : 0
  const freeSpins = scatters >= 3 ? SCATTER_SPINS[Math.min(scatters, 5) - 3] : 0
  units += scatterUnits
  if (free) units *= FREE_SPIN_MULT
  return { grid, mults, wins, scatters, scatterUnits: free ? scatterUnits * FREE_SPIN_MULT : scatterUnits, freeSpins, units }
}

/** A whole round: the base spin, then any free spins (retriggers included), stopping at the 50,000x cap. */
export function playRound(floats) {
  const spins = [spin(floats, 0)]
  let total = Math.min(CAP_UNITS, spins[0].units)
  let left = Math.min(MAX_FREE_SPINS, spins[0].freeSpins)
  let awarded = left
  let i = 1
  while (left > 0 && total < CAP_UNITS) {
    const s = spin(floats, i * FLOATS_PER_SPIN, true)
    spins.push(s)
    total = Math.min(CAP_UNITS, total + s.units)
    left -= 1
    // Retriggers add spins, up to 30 free spins in the round.
    const extra = Math.min(s.freeSpins, MAX_FREE_SPINS - awarded)
    left += extra
    awarded += extra
    i++
  }
  return { spins, freeSpins: awarded, units: total, multiplier: total / 100, capped: total >= CAP_UNITS }
}

export const SYMBOL_NAME = {
  cherry: 'Cherry',
  lemon: 'Lemon',
  orange: 'Orange',
  plum: 'Grapes',
  bell: 'Bell',
  bar: 'Bar',
  seven: 'Seven',
  diamond: 'Diamond',
  wild: 'Wild',
  scatter: 'Star',
}
