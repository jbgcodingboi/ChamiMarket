import { MAX_HISTORY_ENTRIES, MAX_SNAPSHOTS, RESET_CASH, STARTING_CASH } from '../config.js'
import { isFiniteNumber, roundMoney, roundShares, sumMoney } from './math.js'
import { isPlainObject } from './storage.js'

export const positionKey = (marketId, side) => `${marketId}:${side}`

export function createPortfolio(now = Date.now()) {
  return {
    cash: STARTING_CASH,
    positions: {},
    realizedPnl: 0,
    history: [],
    snapshots: [{ t: now, equity: STARTING_CASH }],
    resetsUsed: 0,
    run: 1,
    runStartCash: STARTING_CASH,
    tradeCount: 0,
    createdAt: now,
  }
}

/** Volume-weighted average buy price of a position. */
export function avgPrice(position) {
  if (!position || !(position.shares > 0)) return 0
  return position.costBasis / position.shares
}

export const positionValue = (position, price) => roundMoney(position.shares * price)

/** (current price - average price) x shares, computed as value - cost basis. */
export const unrealizedPnl = (position, price) =>
  roundMoney(positionValue(position, price) - position.costBasis)

/** Resolves a usable price for a position, falling back to its average price. */
function priceFor(position, getPrice) {
  const p = getPrice ? getPrice(position.marketId, position.side) : null
  return isFiniteNumber(p) && p >= 0 && p <= 1 ? p : avgPrice(position)
}

/** Net Worth = cash + sum(shares x current price) over open positions. */
export function computeNetWorth(cash, positions, getPrice) {
  const values = Object.values(positions).map((pos) => positionValue(pos, priceFor(pos, getPrice)))
  return sumMoney([cash, ...values])
}

function closedTradeStats(history, run) {
  let wins = 0
  let total = 0
  for (const entry of history) {
    if (entry.run !== run) continue
    if (entry.type !== 'sell' && entry.type !== 'settlement') continue
    total += 1
    if (entry.realizedPnl > 0) wins += 1
  }
  return { wins, total, winRate: total ? (wins / total) * 100 : null }
}

export function computeMetrics(portfolio, getPrice) {
  const positions = Object.values(portfolio.positions)
  const values = []
  const costs = []
  const pnls = []
  for (const pos of positions) {
    const price = priceFor(pos, getPrice)
    values.push(positionValue(pos, price))
    costs.push(pos.costBasis)
    pnls.push(unrealizedPnl(pos, price))
  }
  const invested = sumMoney(costs)
  const marketValue = sumMoney(values)
  const unrealized = sumMoney(pnls)
  const netWorth = sumMoney([portfolio.cash, marketValue])
  const stats = closedTradeStats(portfolio.history, portfolio.run)
  return {
    cash: roundMoney(portfolio.cash),
    invested,
    marketValue,
    unrealizedPnl: unrealized,
    unrealizedPct: invested > 0 ? (unrealized / invested) * 100 : 0,
    realizedPnl: roundMoney(portfolio.realizedPnl),
    totalPnl: roundMoney(netWorth - portfolio.runStartCash),
    totalPnlPct: portfolio.runStartCash > 0 ? ((netWorth - portfolio.runStartCash) / portfolio.runStartCash) * 100 : 0,
    netWorth,
    openPositions: positions.length,
    winRate: stats.winRate,
    closedTrades: stats.total,
  }
}

export function capHistory(history) {
  return history.length > MAX_HISTORY_ENTRIES ? history.slice(0, MAX_HISTORY_ENTRIES) : history
}

/**
 * Appends an equity snapshot. Unless forced, skips if the previous snapshot is
 * younger than minIntervalMs and equity is unchanged, keeping storage small.
 */
export function addSnapshot(portfolio, equity, now = Date.now(), { force = false, minIntervalMs = 0 } = {}) {
  const snaps = portfolio.snapshots
  const last = snaps[snaps.length - 1]
  if (!force && last && now - last.t < minIntervalMs) return portfolio
  if (!force && last && last.equity === equity && now - last.t < minIntervalMs * 6) return portfolio
  const next = [...snaps, { t: now, equity: roundMoney(equity) }]
  return { ...portfolio, snapshots: next.length > MAX_SNAPSHOTS ? next.slice(-MAX_SNAPSHOTS) : next }
}

/**
 * Starts a fresh run: cash becomes $50,000, open positions are cleared and
 * realized PnL is zeroed. Trade history is kept, with a reset marker entry,
 * and later metrics only consider entries from the new run.
 */
export function resetPortfolio(portfolio, now = Date.now(), id = `reset_${now}`) {
  const cleared = Object.keys(portfolio.positions).length
  const entry = {
    id,
    ts: now,
    run: portfolio.run,
    type: 'reset',
    amount: RESET_CASH,
    note: `Balance reset to $50,000.00. ${cleared} open position${cleared === 1 ? '' : 's'} cleared.`,
  }
  return {
    ...portfolio,
    cash: RESET_CASH,
    positions: {},
    realizedPnl: 0,
    history: capHistory([entry, ...portfolio.history]),
    snapshots: [{ t: now, equity: RESET_CASH }],
    resetsUsed: portfolio.resetsUsed + 1,
    run: portfolio.run + 1,
    runStartCash: RESET_CASH,
  }
}

const isPosition = (p) =>
  isPlainObject(p) &&
  typeof p.marketId === 'string' &&
  (p.side === 'yes' || p.side === 'no') &&
  isFiniteNumber(p.shares) &&
  p.shares > 0 &&
  isFiniteNumber(p.costBasis) &&
  p.costBasis >= 0

/** Structural validation used when loading a portfolio from storage. */
export function isValidPortfolio(p) {
  return (
    isPlainObject(p) &&
    isFiniteNumber(p.cash) &&
    p.cash >= 0 &&
    isPlainObject(p.positions) &&
    Object.values(p.positions).every(isPosition) &&
    isFiniteNumber(p.realizedPnl) &&
    Array.isArray(p.history) &&
    Array.isArray(p.snapshots) &&
    Number.isInteger(p.resetsUsed) &&
    Number.isInteger(p.run) &&
    isFiniteNumber(p.runStartCash) &&
    Number.isInteger(p.tradeCount)
  )
}

/** Drops malformed history and snapshot rows without discarding the account. */
export function sanitizePortfolio(p) {
  return {
    ...p,
    cash: roundMoney(p.cash),
    history: p.history.filter((e) => isPlainObject(e) && typeof e.type === 'string' && isFiniteNumber(e.ts)),
    snapshots: p.snapshots.filter((s) => isPlainObject(s) && isFiniteNumber(s.t) && isFiniteNumber(s.equity)),
    positions: Object.fromEntries(
      Object.entries(p.positions).map(([k, pos]) => [
        k,
        { ...pos, shares: roundShares(pos.shares), costBasis: roundMoney(pos.costBasis) },
      ]),
    ),
  }
}
