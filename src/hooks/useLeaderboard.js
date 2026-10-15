import { useMemo } from 'react'
import { PRO_STARTING_EQUITY, PRO_TRADERS } from '../services/mockTraders.js'
import { readAccounts, readPortfolio, useAccountStore } from '../store/accountStore.js'
import { getMarket, useMarketStore } from '../store/marketStore.js'
import { useMockTraderStore } from '../store/mockTraderStore.js'
import { getOutcomePrice } from '../store/prices.js'
import { useResolutionStore } from '../store/resolutionStore.js'
import { roundMoney } from '../utils/math.js'
import { computeNetWorth } from '../utils/portfolio.js'

function proTraderEquity(trader, holdings, drift) {
  let cents = Math.round(trader.equity * 100)
  for (const h of holdings) {
    const current = getMarket(h.marketId)
    const price = current ? (h.side === 'yes' ? current.yesPrice : current.noPrice) : h.entryPrice
    cents += Math.round(h.shares * (price - h.entryPrice) * 100)
  }
  return roundMoney((cents / 100) * drift)
}

/** Ranked rows for every local account plus the simulated pro traders. */
export function useLeaderboard() {
  const tick = useMarketStore((s) => s.tick)
  const resolutions = useResolutionStore((s) => s.resolutions)
  const portfolio = useAccountStore((s) => s.portfolio)
  const accountsVersion = useAccountStore((s) => s.accounts.length)
  const { holdings, drift, simTrades } = useMockTraderStore()

  return useMemo(() => {
    const rows = []
    for (const account of readAccounts()) {
      const p = readPortfolio(account.id)
      if (!p) continue
      const netWorth = computeNetWorth(p.cash, p.positions, getOutcomePrice)
      rows.push({
        id: account.id,
        name: account.username,
        netWorth,
        pnl: roundMoney(netWorth - p.runStartCash),
        trades: p.tradeCount,
        sim: false,
      })
    }
    for (const trader of PRO_TRADERS) {
      const netWorth = proTraderEquity(trader, holdings[trader.name] ?? [], drift[trader.name] ?? 1)
      rows.push({
        id: `pro:${trader.name}`,
        name: trader.name,
        netWorth,
        pnl: roundMoney(netWorth - PRO_STARTING_EQUITY),
        trades: trader.trades + (simTrades[trader.name] ?? 0),
        sim: true,
      })
    }
    rows.sort((a, b) => b.netWorth - a.netWorth)
    return rows.map((r, i) => ({ ...r, rank: i + 1 }))
    // tick, resolutions, portfolio and accountsVersion invalidate storage-backed values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, resolutions, portfolio, accountsVersion, holdings, drift, simTrades])
}
