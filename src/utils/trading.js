import { MIN_ORDER } from '../config.js'
import { formatCurrency, formatShares } from './format.js'
import { isFiniteNumber, roundMoney, roundShares } from './math.js'
import { avgPrice, capHistory, positionKey } from './portfolio.js'

export class TradeError extends Error {}

/** A tradable price must sit strictly between $0 and $1. */
export const isTradablePrice = (price) => isFiniteNumber(price) && price > 0 && price < 1

/**
 * Live preview for a market buy. Shares = amount / price.
 * Returns the numbers to display plus an error message when the order is invalid.
 */
export function previewBuy({ amount, price, cash }) {
  const spend = roundMoney(amount)
  const base = { valid: false, error: null, amount: spend, shares: 0, avgPrice: price, payout: 0, profit: 0, roi: 0 }
  if (!isTradablePrice(price)) return { ...base, error: 'This outcome has no tradable price right now.' }
  if (!isFiniteNumber(Number(amount)) || spend <= 0) return { ...base, error: 'Enter an amount greater than $0.' }
  const shares = roundShares(spend / price)
  const payout = roundMoney(shares)
  const profit = roundMoney(payout - spend)
  const preview = {
    ...base,
    shares,
    avgPrice: shares > 0 ? spend / shares : price,
    payout,
    profit,
    roi: spend > 0 ? (profit / spend) * 100 : 0,
  }
  if (spend < MIN_ORDER) return { ...preview, error: `Minimum order is ${formatCurrency(MIN_ORDER)}.` }
  if (!(cash > 0)) return { ...preview, error: 'You have no cash available. Sell a position or reset your balance.' }
  if (spend > roundMoney(cash)) {
    return { ...preview, error: `Amount exceeds your available cash (${formatCurrency(cash)}).` }
  }
  if (shares < 0.0001) return { ...preview, error: 'Order is too small to buy any shares.' }
  return { ...preview, valid: true }
}

/** Executes a market buy and merges it into an existing position (weighted average). */
export function executeBuy(portfolio, { marketId, marketTitle, side, amount, price, now = Date.now(), id }) {
  const preview = previewBuy({ amount, price, cash: portfolio.cash })
  if (!preview.valid) throw new TradeError(preview.error)
  const key = positionKey(marketId, side)
  const existing = portfolio.positions[key]
  const position = {
    marketId,
    side,
    marketTitle,
    shares: roundShares((existing?.shares ?? 0) + preview.shares),
    costBasis: roundMoney((existing?.costBasis ?? 0) + preview.amount),
    openedAt: existing?.openedAt ?? now,
    updatedAt: now,
  }
  const entry = {
    id: id ?? `buy_${now}`,
    ts: now,
    run: portfolio.run,
    type: 'buy',
    marketId,
    marketTitle,
    side,
    shares: preview.shares,
    price,
    amount: preview.amount,
    realizedPnl: null,
  }
  return {
    portfolio: {
      ...portfolio,
      cash: roundMoney(portfolio.cash - preview.amount),
      positions: { ...portfolio.positions, [key]: position },
      history: capHistory([entry, ...portfolio.history]),
      tradeCount: portfolio.tradeCount + 1,
    },
    entry,
    position,
  }
}

/**
 * Live preview for selling part or all of a position at the current price.
 * Realized PnL = proceeds - (shares sold x average buy price).
 */
export function previewSell({ position, shares, price }) {
  const qty = roundShares(shares)
  const base = { valid: false, error: null, shares: qty, proceeds: 0, costPortion: 0, realizedPnl: 0, isFull: false }
  if (!position || !(position.shares > 0)) return { ...base, error: 'You have no shares to sell.' }
  if (!isTradablePrice(price)) return { ...base, error: 'This outcome has no tradable price right now.' }
  if (!isFiniteNumber(Number(shares)) || qty <= 0) return { ...base, error: 'Enter a number of shares greater than 0.' }
  if (qty > position.shares + 1e-9) {
    return { ...base, error: `You only own ${formatShares(position.shares)} shares.` }
  }
  const isFull = position.shares - qty < 0.0001
  const sold = isFull ? position.shares : qty
  const proceeds = roundMoney(sold * price)
  const costPortion = isFull ? position.costBasis : roundMoney(sold * avgPrice(position))
  const preview = {
    ...base,
    shares: sold,
    proceeds,
    costPortion,
    realizedPnl: roundMoney(proceeds - costPortion),
    isFull,
  }
  if (!isFull && proceeds < 0.01) return { ...preview, error: 'Sale is too small to produce any proceeds.' }
  return { ...preview, valid: true }
}

export function executeSell(portfolio, { marketId, side, shares, price, now = Date.now(), id }) {
  const key = positionKey(marketId, side)
  const position = portfolio.positions[key]
  const preview = previewSell({ position, shares, price })
  if (!preview.valid) throw new TradeError(preview.error)
  const positions = { ...portfolio.positions }
  if (preview.isFull) {
    delete positions[key]
  } else {
    positions[key] = {
      ...position,
      shares: roundShares(position.shares - preview.shares),
      costBasis: roundMoney(position.costBasis - preview.costPortion),
      updatedAt: now,
    }
  }
  const entry = {
    id: id ?? `sell_${now}`,
    ts: now,
    run: portfolio.run,
    type: 'sell',
    marketId,
    marketTitle: position.marketTitle,
    side,
    shares: preview.shares,
    price,
    amount: preview.proceeds,
    realizedPnl: preview.realizedPnl,
  }
  return {
    portfolio: {
      ...portfolio,
      cash: roundMoney(portfolio.cash + preview.proceeds),
      positions,
      realizedPnl: roundMoney(portfolio.realizedPnl + preview.realizedPnl),
      history: capHistory([entry, ...portfolio.history]),
      tradeCount: portfolio.tradeCount + 1,
    },
    entry,
    preview,
  }
}

/**
 * Winning shares pay $1.00 each, losing shares pay $0.00. A "void" result
 * refunds the cost basis (no gain or loss).
 */
export function settlePosition(position, winningSide) {
  if (winningSide === 'void') return { payout: roundMoney(position.costBasis), realizedPnl: 0 }
  const payout = position.side === winningSide ? roundMoney(position.shares) : 0
  return { payout, realizedPnl: roundMoney(payout - position.costBasis) }
}

/**
 * Liquidates every position the portfolio holds in a resolved market.
 * Returns the unchanged portfolio (and zero totals) when nothing is held.
 */
export function settleMarket(portfolio, { marketId, outcome, now = Date.now() }) {
  const held = Object.entries(portfolio.positions).filter(([, p]) => p.marketId === marketId)
  if (!held.length) return { portfolio, entries: [], payout: 0, realizedPnl: 0 }
  const positions = { ...portfolio.positions }
  const entries = []
  let payoutCents = 0
  let pnlCents = 0
  for (const [key, pos] of held) {
    const { payout, realizedPnl } = settlePosition(pos, outcome)
    payoutCents += Math.round(payout * 100)
    pnlCents += Math.round(realizedPnl * 100)
    delete positions[key]
    entries.push({
      id: `settle_${marketId}_${pos.side}_${now}`,
      ts: now,
      run: portfolio.run,
      type: 'settlement',
      marketId,
      marketTitle: pos.marketTitle,
      side: pos.side,
      shares: pos.shares,
      price: outcome === 'void' ? avgPrice(pos) : pos.side === outcome ? 1 : 0,
      amount: payout,
      realizedPnl,
      note: outcome === 'void' ? 'Voided, refunded at cost' : `Resolved ${outcome === 'yes' ? 'Yes' : 'No'}`,
    })
  }
  const payout = roundMoney(payoutCents / 100)
  const realizedPnl = roundMoney(pnlCents / 100)
  return {
    portfolio: {
      ...portfolio,
      cash: roundMoney(portfolio.cash + payout),
      positions,
      realizedPnl: roundMoney(portfolio.realizedPnl + realizedPnl),
      history: capHistory([...entries, ...portfolio.history]),
    },
    entries,
    payout,
    realizedPnl,
  }
}

/** Settles any positions sitting in markets that already have a recorded resolution. */
export function applyResolutions(portfolio, resolutions, now = Date.now()) {
  let next = portfolio
  const settled = []
  const marketIds = new Set(Object.values(portfolio.positions).map((p) => p.marketId))
  for (const marketId of marketIds) {
    const res = resolutions[marketId]
    if (!res) continue
    const result = settleMarket(next, { marketId, outcome: res.outcome, now })
    next = result.portfolio
    settled.push({ marketId, outcome: res.outcome, payout: result.payout, realizedPnl: result.realizedPnl, entries: result.entries })
  }
  return { portfolio: next, settled }
}
