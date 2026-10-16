import { useMemo } from 'react'
import { PRO_STARTING_EQUITY, PRO_TRADERS, simGameStats } from '../services/mockTraders.js'
import { readAccounts, readPortfolio, useAccountStore } from '../store/accountStore.js'
import { getMarket, useMarketStore } from '../store/marketStore.js'
import { useMockTraderStore } from '../store/mockTraderStore.js'
import { getOutcomePrice } from '../store/prices.js'
import { favoriteGame, runGames } from '../store/gameStore.js'
import { useResolutionStore } from '../store/resolutionStore.js'
import { roundMoney } from '../utils/math.js'
import { computeMetrics } from '../utils/portfolio.js'

function proTraderEquity(trader, holdings, drift) {
  let cents = Math.round(trader.equity * 100)
  for (const h of holdings) {
    const current = getMarket(h.marketId)
    const price = current ? (h.side === 'yes' ? current.yesPrice : current.noPrice) : h.entryPrice
    cents += Math.round(h.shares * (price - h.entryPrice) * 100)
  }
  return roundMoney((cents / 100) * drift)
}

/**
 * One row per local account plus the simulated pro traders, with overall,
 * market and game figures for the current run. Overall PnL is net worth
 * against the run's starting cash; markets PnL is that minus game results,
 * so the two boards always add up to the overall one. Rows come unsorted.
 */
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
      const m = computeMetrics(p, getOutcomePrice)
      const games = runGames(p)
      rows.push({
        id: account.id,
        name: account.username,
        sim: false,
        netWorth: m.netWorth,
        pnl: m.totalPnl,
        pnlPct: m.totalPnlPct,
        marketPnl: roundMoney(m.totalPnl - games.net),
        realized: m.realizedPnl,
        unrealized: m.unrealizedPnl,
        trades: p.tradeCount,
        winRate: m.winRate,
        openPositions: m.openPositions,
        games: { ...games, favorite: favoriteGame(p) },
      })
    }
    for (const trader of PRO_TRADERS) {
      const netWorth = proTraderEquity(trader, holdings[trader.name] ?? [], drift[trader.name] ?? 1)
      const pnl = roundMoney(netWorth - PRO_STARTING_EQUITY)
      const games = simGameStats(trader.name)
      rows.push({
        id: `pro:${trader.name}`,
        name: trader.name,
        sim: true,
        netWorth,
        pnl,
        pnlPct: (pnl / PRO_STARTING_EQUITY) * 100,
        marketPnl: roundMoney(pnl - games.net),
        realized: null,
        unrealized: null,
        trades: trader.trades + (simTrades[trader.name] ?? 0),
        winRate: null,
        openPositions: (holdings[trader.name] ?? []).length,
        games,
      })
    }
    return rows
    // tick, resolutions, portfolio and accountsVersion invalidate storage-backed values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, resolutions, portfolio, accountsVersion, holdings, drift, simTrades])
}
