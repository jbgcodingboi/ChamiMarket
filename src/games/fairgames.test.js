import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import * as chicken from './chicken.js'
import * as dice from './dice.js'
import { fairFloats, isClientSeed, newClientSeed, newServerSeed, sha256Hex } from './fair.js'
import * as mines from './mines.js'

const SEEDS = { serverSeed: 'b'.repeat(64), clientSeed: 'chami', nonce: 7 }

describe('provably fair floats', () => {
  it('match an independent HMAC-SHA256 computation', async () => {
    const floats = await fairFloats(SEEDS, 10)
    const expected = []
    for (let cursor = 0; expected.length < 10; cursor++) {
      const b = createHmac('sha256', SEEDS.serverSeed).update(`chami:7:${cursor}`).digest()
      for (let i = 0; i < 32 && expected.length < 10; i += 4) expected.push(b.readUInt32BE(i) / 2 ** 32)
    }
    expect(floats).toEqual(expected)
    for (const f of floats) expect(f >= 0 && f < 1).toBe(true)
  })
  it('makes fresh seeds and hashes them', async () => {
    expect(newServerSeed()).toMatch(/^[0-9a-f]{64}$/)
    expect(newClientSeed()).toMatch(/^[0-9a-f]{16}$/)
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(isClientSeed('my seed')).toBe(false)
    expect(isClientSeed('lucky-7')).toBe(true)
  })
})

describe('dice', () => {
  it('pays 99 / chance', () => {
    expect(dice.multiplier(50)).toBe(1.98)
    expect(dice.multiplier(2)).toBe(49.5)
    expect(dice.multiplier(98)).toBe(1.0102)
    expect(dice.multiplier(33.33)).toBe(2.9702)
    expect(dice.winChance(75.5, true)).toBe(24.5)
    expect(dice.targetForMultiplier(2, true)).toBe(50.5)
  })
  it('rolls 0.00 to 100.00 and returns about 99%', () => {
    expect(dice.rollFromFloat(0)).toBe(0)
    expect(dice.rollFromFloat(0.99999999)).toBe(10000)
    for (const [target, over] of [[50, true], [10, false], [90.25, true], [2, false]]) {
      let wins = 0
      for (let r = 0; r <= 10000; r++) if (dice.isWin(r, target, over)) wins++
      const ev = (wins / 10001) * dice.multiplier(dice.winChance(target, over))
      expect(ev).toBeGreaterThan(0.985)
      expect(ev).toBeLessThanOrEqual(0.99)
    }
  })
})

describe('mines', () => {
  it('places the requested number of distinct mines', async () => {
    for (let n = 0; n < 50; n++) {
      const floats = await fairFloats({ ...SEEDS, nonce: n }, 24)
      for (const m of [1, 3, 10, 24]) {
        const pos = mines.placeMines(floats, m)
        expect(new Set(pos).size).toBe(m)
        expect(pos.every((p) => p >= 0 && p < 25)).toBe(true)
      }
    }
  })
  it('pays 0.99 / P(safe so far), never more', () => {
    expect(mines.multiplier(1, 1)).toBe(1.03)
    expect(mines.multiplier(3, 1)).toBe(1.12)
    expect(mines.multiplier(24, 1)).toBe(24.75)
    expect(mines.multiplier(5, 0)).toBe(1)
    for (let m = 1; m <= 24; m++) {
      let p = 1
      for (let g = 1; g <= mines.maxGems(m); g++) {
        p *= mines.nextSafeChance(m, g - 1)
        const ev = p * mines.multiplier(m, g)
        expect(ev).toBeLessThanOrEqual(0.990000001)
        if (mines.multiplier(m, g) < 1000) expect(ev).toBeGreaterThan(0.95)
      }
    }
  })
})

describe('chicken cross', () => {
  it('compounds 0.98 / survival per lane', () => {
    expect(chicken.multiplier('easy', 1)).toBe(1.02)
    expect(chicken.multiplier('medium', 1)).toBe(1.11)
    expect(chicken.multiplier('hard', 3)).toBe(1.91)
    expect(chicken.multiplier('daredevil', 0)).toBe(1)
    for (const d of chicken.DIFFICULTY_IDS) {
      const list = chicken.laneMultipliers(d)
      expect(list).toHaveLength(chicken.DIFFICULTIES[d].lanes)
      list.forEach((m, i) => {
        const ev = chicken.survival(d) ** (i + 1) * m
        expect(ev).toBeLessThanOrEqual(0.98 + 1e-9)
        expect(ev).toBeGreaterThan(0.97)
        if (i) expect(m).toBeGreaterThan(list[i - 1])
      })
    }
  })
  it('finds the lane the chicken is hit on', () => {
    expect(chicken.crashLane([0.1, 0.5, 0.97], 'easy')).toBe(3)
    expect(chicken.crashLane([0.7], 'daredevil')).toBe(1)
    expect(chicken.crashLane(Array(30).fill(0.1), 'easy')).toBeNull()
  })
})
