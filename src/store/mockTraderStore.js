import { create } from 'zustand'
import { buildHoldings, PRO_TRADERS } from '../services/mockTraders.js'
import { clamp } from '../utils/math.js'

/**
 * Leaderboard pro traders. Each holds a few seeded positions in current
 * markets, so their equity moves with live (or demo) prices; a small random
 * drift on every refresh stands in for trading we don't simulate in detail.
 */
export const useMockTraderStore = create((set, get) => ({
  holdings: {},
  drift: Object.fromEntries(PRO_TRADERS.map((t) => [t.name, 1])),
  simTrades: {},

  sync(markets) {
    if (!markets.length) return
    const { holdings, drift } = get()
    const ids = new Set(markets.map((m) => m.id))
    const nextHoldings = { ...holdings }
    for (const trader of PRO_TRADERS) {
      const current = holdings[trader.name]
      if (!current || !current.some((h) => ids.has(h.marketId))) {
        nextHoldings[trader.name] = buildHoldings(trader, markets)
      }
    }
    const nextDrift = {}
    for (const trader of PRO_TRADERS) {
      const step = (Math.random() - 0.5) * 0.004
      nextDrift[trader.name] = clamp((drift[trader.name] ?? 1) + step, 0.97, 1.03)
    }
    set({ holdings: nextHoldings, drift: nextDrift })
  },

  recordSimTrade(name) {
    set((s) => ({ simTrades: { ...s.simTrades, [name]: (s.simTrades[name] ?? 0) + 1 } }))
  },
}))
