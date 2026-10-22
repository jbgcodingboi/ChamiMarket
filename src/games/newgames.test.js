import { describe, expect, it } from 'vitest'
import { fairFloats } from './fair.js'
import * as limbo from './limbo.js'
import * as S from './slots.js'

const SEEDS = { serverSeed: 'b'.repeat(64), clientSeed: 'chami' }
const K = 16777216 * 99

describe('limbo and crash', () => {
  it('turns a float into 1.00× to 1,000,000× with exact integers', () => {
    expect(limbo.resultCents(0)).toBe(100000000)
    expect(limbo.resultCents(0.999999999)).toBe(100)
    expect(limbo.resultCents(0.5)).toBe(197)
    expect(limbo.resultFromFloat(1 / 3)).toBe(2.96)
  })
  it('returns 99% at any target', () => {
    // n + 1 <= floor(K / t) wins, out of 2^24 equally likely n.
    for (const t of [101, 200, 1000, 10000, 100000, 1000000]) {
      const rtp = (Math.floor(K / t) / 16777216) * (t / 100)
      expect(rtp).toBeGreaterThan(0.989)
      expect(rtp).toBeLessThanOrEqual(0.99)
    }
  })
  it('matches the server for known seeds (see supabase/tests)', async () => {
    const out = []
    for (let nonce = 0; nonce < 6; nonce++) out.push(limbo.resultCents((await fairFloats({ ...SEEDS, nonce }, 1))[0]))
    expect(out).toEqual([104, 118, 398, 233, 207, 206])
  })
  it('wins when the result reaches the target, and the curve doubles in about 11.6 s', () => {
    expect(limbo.isWin(2, 2)).toBe(true)
    expect(limbo.isWin(1.99, 2)).toBe(false)
    expect(limbo.clampTarget(0.5)).toBe(1.01)
    expect(limbo.clampTarget(5e6)).toBe(1000000)
    expect(limbo.winChance(2)).toBe(49.5)
    expect(limbo.targetForChance(49.5)).toBe(2)
    expect(limbo.multiplierAt(0)).toBe(1)
    expect(limbo.multiplierAt(limbo.timeTo(2) + 1)).toBe(2)
    expect(Math.round(limbo.timeTo(2))).toBe(11552)
  })
})

/** Floats that land a given symbol in a cell. */
const at = (table, sym) => (table.weights.slice(0, table.symbols.indexOf(sym)).reduce((a, b) => a + b, 0) + 0.5) / table.total
/** One spin's floats from a 5x3 grid (grid[reel][row]) and optional wild multipliers. */
function floatsFor(grid, mults = {}) {
  const f = new Array(S.FLOAT_COUNT).fill(0.5)
  grid.forEach((col, r) => col.forEach((sym, row) => {
    f[r * 3 + row] = at(r === 0 || r === 4 ? S.OUTER : S.MIDDLE, sym)
    if (sym === 'wild') f[15 + (r - 1) * 3 + row] = at(S.WILD_MULT, mults[`${r}${row}`] ?? 2)
  }))
  return f
}
const filler = ['lemon', 'orange', 'cherry']

describe('golden sevens slot', () => {
  it('pays a line left to right in line bets', () => {
    // Bells across the middle row (line 1), nothing else lines up.
    const grid = [['lemon', 'bell', 'cherry'], ['orange', 'bell', 'plum'], ['cherry', 'bell', 'lemon'], ['plum', 'orange', 'bar'], ['bar', 'lemon', 'orange']]
    const s = S.spin(floatsFor(grid), 0)
    const bell = s.wins.find((w) => w.symbol === 'bell')
    expect(bell).toEqual({ line: 0, symbol: 'bell', count: 3, mult: 1, units: 6 * 5 })
  })
  it('multiplies wilds on a line together', () => {
    const grid = [['diamond', 'lemon', 'cherry'], ['wild', 'orange', 'plum'], ['wild', 'cherry', 'lemon'], ['wild', 'plum', 'orange'], ['diamond', 'orange', 'lemon']]
    const s = S.spin(floatsFor(grid, { 10: 10, 20: 10, 30: 10 }), 0)
    const top = s.wins.find((w) => w.line === 1)
    // 5 diamonds on the top line: 3000 line bets, times 10 x 10 x 10 = 150,000x the bet before the cap.
    expect(top).toEqual({ line: 1, symbol: 'diamond', count: 5, mult: 1000, units: 3000 * 5 * 1000 })
    expect(S.playRound(floatsFor(grid, { 10: 10, 20: 10, 30: 10 })).units).toBe(S.CAP_X * 100)
  })
  it('pays scatters anywhere and starts free spins that pay triple', () => {
    const grid = [['scatter', 'lemon', 'cherry'], ['orange', 'scatter', 'plum'], ['cherry', 'lemon', 'scatter'], filler, filler]
    const base = S.spin(floatsFor(grid), 0)
    expect(base.scatters).toBe(3)
    expect(base.scatterUnits).toBe(200)
    expect(base.freeSpins).toBe(10)
    const free = S.spin(floatsFor(grid), 0, true)
    expect(free.units).toBe(base.units * 3)
  })
  it('never gives more than 30 free spins in a round', () => {
    const grid = [['scatter', 'scatter', 'scatter'], ['scatter', 'lemon', 'plum'], ['cherry', 'scatter', 'lemon'], filler, filler]
    const one = floatsFor(grid)
    const f = []
    for (let i = 0; i <= S.MAX_FREE_SPINS; i++) f.push(...one.slice(0, S.FLOATS_PER_SPIN))
    const r = S.playRound(f)
    expect(r.freeSpins).toBe(S.MAX_FREE_SPINS)
    expect(r.spins.length).toBe(1 + S.MAX_FREE_SPINS)
  })
  it('matches the server for known seeds (see supabase/tests)', async () => {
    const units = {}
    for (const nonce of [0, 1, 15, 45, 424, 17392]) units[nonce] = S.playRound(await fairFloats({ ...SEEDS, nonce }, S.FLOAT_COUNT)).units
    expect(units).toEqual({ 0: 30, 1: 0, 15: 470, 45: 635, 424: 7670, 17392: 123545 })
  })
})
