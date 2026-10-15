import { describe, expect, it } from 'vitest'
import { createPortfolio, positionKey } from './portfolio.js'
import {
  applyResolutions,
  executeBuy,
  executeSell,
  previewBuy,
  previewSell,
  settleMarket,
  settlePosition,
} from './trading.js'

const market = { marketId: 'm1', marketTitle: 'Test market' }
const buy = (p, side, amount, price) => executeBuy(p, { ...market, side, amount, price, now: 1 }).portfolio

describe('share calculation', () => {
  it('a $1,000 buy at $0.40 yields exactly 2,500 shares', () => {
    const preview = previewBuy({ amount: 1000, price: 0.4, cash: 100000 })
    expect(preview.valid).toBe(true)
    expect(preview.shares).toBe(2500)
    expect(preview.payout).toBe(2500)
    expect(preview.profit).toBe(1500)
    expect(preview.roi).toBe(150)
  })

  it('rejects zero, negative, oversized and invalid-price orders', () => {
    expect(previewBuy({ amount: 0, price: 0.5, cash: 100 }).valid).toBe(false)
    expect(previewBuy({ amount: -5, price: 0.5, cash: 100 }).valid).toBe(false)
    expect(previewBuy({ amount: 101, price: 0.5, cash: 100 }).error).toMatch(/exceeds/)
    expect(previewBuy({ amount: 10, price: 0, cash: 100 }).valid).toBe(false)
    expect(previewBuy({ amount: 10, price: 1, cash: 100 }).valid).toBe(false)
    expect(previewBuy({ amount: 10, price: 0.5, cash: 0 }).error).toMatch(/no cash/)
    expect(previewBuy({ amount: 0.004, price: 0.5, cash: 100 }).valid).toBe(false)
  })

  it('handles extreme prices', () => {
    const cheap = previewBuy({ amount: 1, price: 0.001, cash: 100 })
    expect(cheap.shares).toBe(1000)
    const rich = previewBuy({ amount: 0.01, price: 0.999, cash: 100 })
    expect(rich.valid).toBe(true)
    expect(rich.shares).toBe(0.01)
  })
})

describe('buying and average price', () => {
  it('deducts cash and tracks a volume-weighted average', () => {
    let p = createPortfolio(0)
    p = buy(p, 'yes', 1000, 0.4)
    p = buy(p, 'yes', 1500, 0.6)
    const pos = p.positions[positionKey('m1', 'yes')]
    expect(p.cash).toBe(97500)
    expect(pos.shares).toBe(5000)
    expect(pos.costBasis).toBe(2500)
    expect(pos.costBasis / pos.shares).toBe(0.5)
    expect(p.tradeCount).toBe(2)
  })

  it('throws when cash is insufficient', () => {
    expect(() => buy(createPortfolio(0), 'yes', 100000.01, 0.5)).toThrow(/exceeds/)
  })
})

describe('selling', () => {
  it('computes realized PnL against the average buy price', () => {
    let p = buy(createPortfolio(0), 'yes', 1000, 0.4) // 2500 sh
    const res = executeSell(p, { marketId: 'm1', side: 'yes', shares: 1000, price: 0.6, now: 2 })
    p = res.portfolio
    expect(res.preview.proceeds).toBe(600)
    expect(res.preview.realizedPnl).toBe(200)
    expect(p.cash).toBe(99600)
    expect(p.realizedPnl).toBe(200)
    expect(p.positions['m1:yes'].shares).toBe(1500)
    expect(p.positions['m1:yes'].costBasis).toBe(600)
  })

  it('removes the position on a full sale with no residue', () => {
    let p = buy(createPortfolio(0), 'no', 100, 0.3) // 333.3333 sh
    const shares = p.positions['m1:no'].shares
    p = executeSell(p, { marketId: 'm1', side: 'no', shares, price: 0.3, now: 2 }).portfolio
    expect(p.positions['m1:no']).toBeUndefined()
    expect(p.cash).toBe(100000)
    expect(p.realizedPnl).toBe(0)
  })

  it('refuses to sell more than owned', () => {
    const p = buy(createPortfolio(0), 'yes', 100, 0.5)
    const preview = previewSell({ position: p.positions['m1:yes'], shares: 201, price: 0.5 })
    expect(preview.valid).toBe(false)
    expect(preview.error).toMatch(/only own/)
    expect(() => executeSell(p, { marketId: 'm1', side: 'yes', shares: 201, price: 0.5 })).toThrow()
  })
})

describe('settlement', () => {
  it('pays $1 per winning share and $0 per losing share', () => {
    expect(settlePosition({ side: 'yes', shares: 2500, costBasis: 1000 }, 'yes')).toEqual({ payout: 2500, realizedPnl: 1500 })
    expect(settlePosition({ side: 'no', shares: 100, costBasis: 40 }, 'yes')).toEqual({ payout: 0, realizedPnl: -40 })
  })

  it('liquidates both sides of a market and records history', () => {
    let p = buy(createPortfolio(0), 'yes', 1000, 0.4)
    p = buy(p, 'no', 600, 0.6)
    const res = settleMarket(p, { marketId: 'm1', outcome: 'no', now: 5 })
    expect(res.payout).toBe(1000)
    expect(res.realizedPnl).toBe(-600)
    expect(res.portfolio.cash).toBe(98400 + 1000)
    expect(Object.keys(res.portfolio.positions)).toHaveLength(0)
    expect(res.entries.map((e) => e.type)).toEqual(['settlement', 'settlement'])
  })

  it('is a no-op for a market with no position', () => {
    const p = createPortfolio(0)
    const res = settleMarket(p, { marketId: 'other', outcome: 'yes' })
    expect(res.portfolio).toBe(p)
    expect(res.payout).toBe(0)
  })

  it('applies stored resolutions lazily', () => {
    const p = buy(createPortfolio(0), 'yes', 500, 0.5)
    const { portfolio, settled } = applyResolutions(p, { m1: { outcome: 'yes' }, x: { outcome: 'no' } })
    expect(settled).toHaveLength(1)
    expect(portfolio.cash).toBe(100500)
    expect(portfolio.realizedPnl).toBe(500)
  })
})
