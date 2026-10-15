import { describe, expect, it } from 'vitest'
import { RESET_CASH, STARTING_CASH } from '../config.js'
import {
  computeMetrics,
  computeNetWorth,
  createPortfolio,
  isValidPortfolio,
  resetPortfolio,
} from './portfolio.js'
import { executeBuy, executeSell } from './trading.js'

const buy = (p, marketId, side, amount, price) =>
  executeBuy(p, { marketId, marketTitle: marketId, side, amount, price, now: 1 }).portfolio

describe('new accounts', () => {
  it('start with exactly $100,000.00', () => {
    const p = createPortfolio(0)
    expect(p.cash).toBe(STARTING_CASH)
    expect(p.cash).toBe(100000)
    expect(isValidPortfolio(p)).toBe(true)
  })
})

describe('net worth and PnL', () => {
  it('net worth = cash + sum(shares x current price)', () => {
    let p = buy(createPortfolio(0), 'a', 'yes', 1000, 0.4) // 2500 sh
    p = buy(p, 'b', 'no', 300, 0.3) // 1000 sh
    const prices = { 'a:yes': 0.5, 'b:no': 0.25 }
    const getPrice = (id, side) => prices[`${id}:${side}`]
    expect(computeNetWorth(p.cash, p.positions, getPrice)).toBe(98700 + 1250 + 250)
    const m = computeMetrics(p, getPrice)
    expect(m.netWorth).toBe(100200)
    expect(m.invested).toBe(1300)
    expect(m.marketValue).toBe(1500)
    expect(m.unrealizedPnl).toBe(200)
    expect(m.unrealizedPct).toBeCloseTo(15.3846, 3)
    expect(m.openPositions).toBe(2)
  })

  it('falls back to average price when a market price is unknown', () => {
    const p = buy(createPortfolio(0), 'a', 'yes', 1000, 0.4)
    expect(computeNetWorth(p.cash, p.positions, () => undefined)).toBe(100000)
  })

  it('tracks win rate on closed trades', () => {
    let p = buy(createPortfolio(0), 'a', 'yes', 100, 0.5)
    p = executeSell(p, { marketId: 'a', side: 'yes', shares: 100, price: 0.6 }).portfolio
    p = executeSell(p, { marketId: 'a', side: 'yes', shares: 100, price: 0.4 }).portfolio
    const m = computeMetrics(p, () => 0.5)
    expect(m.closedTrades).toBe(2)
    expect(m.winRate).toBe(50)
    expect(m.realizedPnl).toBe(0)
  })
})

describe('reset', () => {
  it('sets cash to exactly $50,000, clears positions and zeroes PnL', () => {
    let p = buy(createPortfolio(0), 'a', 'yes', 5000, 0.5)
    p = executeSell(p, { marketId: 'a', side: 'yes', shares: 1000, price: 0.7 }).portfolio
    const r = resetPortfolio(p, 10)
    expect(r.cash).toBe(RESET_CASH)
    expect(r.cash).toBe(50000)
    expect(r.positions).toEqual({})
    expect(r.realizedPnl).toBe(0)
    expect(r.resetsUsed).toBe(1)
    expect(r.run).toBe(2)
    expect(r.history[0].type).toBe('reset')
    expect(r.history.length).toBe(p.history.length + 1)
    const m = computeMetrics(r, () => 0.5)
    expect(m.unrealizedPnl).toBe(0)
    expect(m.netWorth).toBe(50000)
    expect(m.totalPnl).toBe(0)
    expect(m.closedTrades).toBe(0)
  })
})
