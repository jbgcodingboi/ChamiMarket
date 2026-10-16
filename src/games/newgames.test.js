import { describe, expect, it } from 'vitest'
import * as B from './boneyard.js'
import { fairFloats } from './fair.js'
import * as limbo from './limbo.js'

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
const NO_NUDGE = 0.9
/** One base spin's floats from symbol names: reel 1 (2), reels 2-4 (3 each, or a nudge), reel 5, split row. */
function floatsFor({ r1, mid, r5, nudges = {}, splitRow = 0 }) {
  const f = new Array(B.FLOAT_COUNT).fill(0.99)
  f[0] = at(B.REEL_1, r1[0])
  f[1] = at(B.REEL_1, r1[1])
  for (let r = 1; r <= 3; r++) {
    const o = 2 + (r - 1) * 5
    if (nudges[r]) {
      f[o] = 0
      f[o + 1] = (nudges[r] - 1 + 0.5) / 3
    } else {
      f[o] = NO_NUDGE
      for (let c = 0; c < 3; c++) f[o + 2 + c] = at(B.REEL_MID, mid[r - 1][c])
    }
  }
  f[17] = at(B.REEL_5, r5)
  f[18] = (splitRow + 0.5) / 3
  return f
}

describe('boneyard', () => {
  it('pays ways left to right', () => {
    const f = floatsFor({ r1: ['sheriff', 'jack'], mid: [['sheriff', 'sheriff', 'jack'], ['sheriff', 'queen', 'king'], ['ace', 'ace', 'ace']], r5: 'ace' })
    const s = B.spin(f, 0, 'base')
    // Sheriff: 1 × 2 × 1 ways on reels 1-3 at 0.25× each.
    expect(s.wins).toEqual([{ symbol: 'sheriff', count: 3, ways: 2, mult: 1, units: 50 }])
    // 0.5× is under the bet, so the R.I.P. rule takes it.
    expect(s.rip).toBe(true)
    expect(s.units).toBe(0)
  })
  it('adds Nudge Wild multipliers and doubles them on a split', () => {
    const plain = floatsFor({ r1: ['outlaw', 'jack'], mid: [[], ['outlaw', 'king', 'king'], []], nudges: { 1: 2, 3: 1 }, r5: 'queen' })
    const s = B.spin(plain, 0, 'base')
    // Reel 2 nudged 1 step (2×), reel 4 nudged 2 steps (3×): 5× on the outlaw ways.
    const outlaw = s.wins.find((w) => w.symbol === 'outlaw')
    expect(s.nudges[1]).toEqual({ visible: 2, steps: 1, mult: 2 })
    expect(outlaw).toEqual({ symbol: 'outlaw', count: 4, ways: 9, mult: 5, units: 60 * 9 * 5 })
    const split = B.spin(floatsFor({ r1: ['outlaw', 'jack'], mid: [[], ['outlaw', 'king', 'king'], []], nudges: { 1: 2, 3: 1 }, r5: 'split', splitRow: 0 }), 0, 'base')
    const w = split.wins.find((x) => x.symbol === 'outlaw')
    // Row 0 split: outlaw on reel 1 and 3 count 2, nudge reels count 4 and double, reel 5 Split Wild counts 2.
    expect(split.splitRow).toBe(0)
    expect(w).toEqual({ symbol: 'outlaw', count: 5, ways: 2 * 4 * 2 * 4 * 2, mult: 10, units: 175 * 128 * 10 })
  })
  it('starts High Noon on 3 scatters and Last Rites with a coffin', () => {
    const mid = [['scatter', 'jack', 'king'], ['scatter', 'queen', 'king'], ['ace', 'ace', 'ace']]
    expect(B.spin(floatsFor({ r1: ['scatter', 'jack'], mid, r5: 'queen' }), 0, 'base').bonus).toBe('high-noon')
    expect(B.spin(floatsFor({ r1: ['scatter', 'jack'], mid, r5: 'coffin' }), 0, 'base').bonus).toBe('last-rites')
    expect(B.spin(floatsFor({ r1: ['jack', 'jack'], mid, r5: 'coffin' }), 0, 'base').bonus).toBe(null)
  })
  it('keeps the free spins multiplier growing and turns the Last Rites character wild', () => {
    const f = floatsFor({ r1: ['jack', 'jack'], mid: [['wild', 'king', 'king'], ['wild', 'wild', 'queen'], ['ace', 'ace', 'ace']], r5: 'queen' })
    expect(B.spin(f, 0, 'high-noon', 4).global).toBe(7)
    f[19] = 0.1 // gambler turns wild
    const s = B.spin(f, 0, 'last-rites', 1)
    expect(s.cowboy).toBe('gambler')
    expect(s.reels[4]).toEqual(['gambler'])
    expect(s.random.symbol).not.toBe('gambler')
    expect(s.wins.some((w) => w.symbol === 'gambler')).toBe(false)
  })
  it('stops a round at 300,000×', () => {
    const f = new Array(B.FLOAT_COUNT).fill(0)
    const r = B.playRound(f)
    expect(r.units).toBeLessThanOrEqual(30000000)
  })
  it('matches the server for known seeds (see supabase/tests)', async () => {
    const units = {}
    for (const nonce of [1, 7, 14, 45, 915, 17181]) units[nonce] = B.playRound(await fairFloats({ ...SEEDS, nonce }, B.FLOAT_COUNT)).units
    expect(units).toEqual({ 1: 0, 7: 160, 14: 9600, 45: 4872, 915: 2314, 17181: 88000 })
  })
})
