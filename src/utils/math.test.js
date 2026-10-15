import { describe, expect, it } from 'vitest'
import { roundMoney, roundShares, roundTo, sumMoney } from './math.js'

describe('rounding helpers', () => {
  it('avoids classic floating-point artifacts', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundShares(2.00004999)).toBe(2)
    expect(roundShares(1 / 3)).toBe(0.3333)
  })

  it('rounds negatives symmetrically and never returns -0 or NaN', () => {
    expect(roundMoney(-1.005)).toBe(-1.01)
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true)
    expect(roundMoney(NaN)).toBe(0)
    expect(roundMoney(Infinity)).toBe(0)
    expect(roundTo(1e-7, 4)).toBe(0)
  })

  it('sums money in cents', () => {
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6)
    expect(sumMoney([100000, -0.01])).toBe(99999.99)
  })
})
