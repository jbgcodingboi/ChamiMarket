import { useEffect, useMemo, useState } from 'react'
import * as backend from '../services/backend/api.js'
import { BACKEND_ENABLED } from '../services/backend/config.js'
import { LEADERBOARD_FILL } from '../config.js'
import { useFeedStore } from '../store/feedStore.js'
import { PRO_STARTING_EQUITY, PRO_TRADERS, simGameStats, spreadPick } from '../services/mockTraders.js'
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
 * The simulated pro traders as leaderboard rows, in their fixed list order
 * (roughly richest first), so the filler picked from them stays the same
 * names as prices move. The boards sort rows themselves.
 */
function useSimRows() {
  const tick = useMarketStore((s) => s.tick)
  const { holdings, drift, simTrades } = useMockTraderStore()
  return useMemo(
    () =>
      PRO_TRADERS.map((trader) => {
        const netWorth = proTraderEquity(trader, holdings[trader.name] ?? [], drift[trader.name] ?? 1)
        const pnl = roundMoney(netWorth - PRO_STARTING_EQUITY)
        const games = simGameStats(trader.name)
        return {
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
        }
      }),
    // tick invalidates prices read through getMarket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, holdings, drift, simTrades],
  )
}

/**
 * One row per local account plus the simulated pro traders, with overall,
 * market and game figures for the current run. Overall PnL is net worth
 * against the run's starting cash; markets PnL is that minus game results,
 * so the two boards always add up to the overall one. Rows come unsorted.
 */
function useLocalLeaderboard() {
  const tick = useMarketStore((s) => s.tick)
  const resolutions = useResolutionStore((s) => s.resolutions)
  const portfolio = useAccountStore((s) => s.portfolio)
  const accountsVersion = useAccountStore((s) => s.accounts.length)
  const sims = useSimRows()

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
    return [...rows, ...sims]
    // tick, resolutions, portfolio and accountsVersion invalidate storage-backed values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, resolutions, portfolio, accountsVersion, sims])
}

const num = (v) => (v === null || v === undefined ? null : Number(v))

/**
 * Backend mode: every player's standings from the server, refreshed every 30
 * seconds and on new activity, topped up with simulated players until there
 * are LEADERBOARD_FILL real ones.
 */
function useServerLeaderboard() {
  const [rows, setRows] = useState(null)
  const sims = useSimRows()
  const latest = useFeedStore((s) => `${s.real[0]?.id}:${s.games[0]?.id}`)
  const portfolio = useAccountStore((s) => s.portfolio)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    let live = true
    backend
      .leaderboard()
      .then((list) => {
        if (!live) return
        setRows(
          (list ?? []).map((r) => ({
            ...r,
            netWorth: num(r.netWorth),
            pnl: num(r.pnl),
            pnlPct: num(r.pnlPct),
            marketPnl: num(r.marketPnl),
            realized: num(r.realized),
            unrealized: num(r.unrealized),
            winRate: num(r.winRate),
            games: { ...r.games, net: num(r.games.net), wagered: num(r.games.wagered), best: num(r.games.best) },
          })),
        )
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [latest, portfolio, tick])
  // Filler waits for the first server answer, so real players don't pop in over it.
  return useMemo(() => (rows ? [...rows, ...spreadPick(sims, LEADERBOARD_FILL - rows.length)] : []), [rows, sims])
}

/** Leaderboard rows: real players from the server in backend mode, else local accounts plus simulated pros. */
export const useLeaderboard = BACKEND_ENABLED ? useServerLeaderboard : useLocalLeaderboard
