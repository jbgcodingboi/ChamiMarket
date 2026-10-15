/**
 * Simulated participants. Pro traders appear on the leaderboard with seeded
 * portfolios; they and a pool of casual handles also generate the clearly
 * labelled simulated entries in the activity feed.
 */
import { roundShares } from '../utils/math.js'
import { createRng, pick, randomId } from '../utils/rng.js'

export const PRO_TRADERS = [
  { name: 'CryptoOracle', equity: 412800, trades: 1843 },
  { name: 'BallotMaster', equity: 366200, trades: 1291 },
  { name: 'SwingStateSam', equity: 298400, trades: 977 },
  { name: 'GridironGuru', equity: 271900, trades: 1520 },
  { name: 'MidtermMaven', equity: 243100, trades: 688 },
  { name: 'HoopsHedger', equity: 219700, trades: 1104 },
  { name: 'PollPundit', equity: 197300, trades: 543 },
  { name: 'ParlayPrincess', equity: 176500, trades: 2210 },
  { name: 'FourthAndLong', equity: 158900, trades: 812 },
  { name: 'ElectoralEdge', equity: 144600, trades: 461 },
  { name: 'OddsOnOllie', equity: 131200, trades: 935 },
  { name: 'RedZoneRita', equity: 118800, trades: 702 },
  { name: 'FilibusterFred', equity: 104300, trades: 318 },
  { name: 'TipOffTom', equity: 92600, trades: 659 },
  { name: 'BullpenBets', equity: 81400, trades: 1188 },
]

export const PRO_STARTING_EQUITY = 100000

const CASUAL_HANDLES = [
  'WhaleTrader99', 'quietkelly', 'dataDan', 'mapleleaf_mo', 'contrarian_cat', 'nightowl88',
  'sixfigurespreads', 'lucky_lena', 'statsgeek', 'benchwarmer', 'coinflipcarl', 'forecastfiona',
  'longshotlou', 'pivotpete', 'marginmaya', 'yesman_jay', 'nottoday_nia', 'gamedaygabe',
]

/** Deterministic holdings for one pro trader, chosen from the current market set. */
export function buildHoldings(trader, markets) {
  const pool = [...markets].sort((a, b) => (a.id < b.id ? -1 : 1))
  if (!pool.length) return []
  const rng = createRng(trader.name)
  const count = Math.min(4, pool.length)
  const chosen = new Set()
  while (chosen.size < count) chosen.add(pool[Math.floor(rng() * pool.length)])
  const allocation = trader.equity * 0.12
  return [...chosen].map((m) => {
    const side = rng() < 0.5 ? 'yes' : 'no'
    const entry = side === 'yes' ? m.yesPrice : m.noPrice
    return { marketId: m.id, side, entryPrice: entry, shares: roundShares(allocation / Math.max(entry, 0.01)) }
  })
}

/** Builds one simulated trade from current market titles and prices. */
export function generateSimTrade(markets, now = Date.now(), rng = Math.random) {
  if (!markets.length) return null
  const ranked = [...markets].sort((a, b) => b.volume - a.volume).slice(0, 30)
  const market = ranked[Math.floor(rng() ** 1.6 * ranked.length)]
  const side = rng() < market.yesPrice * 0.8 + 0.1 ? 'yes' : 'no'
  const price = side === 'yes' ? market.yesPrice : market.noPrice
  if (!(price > 0 && price < 1)) return null
  const user = rng() < 0.45 ? pick(rng, PRO_TRADERS).name : pick(rng, CASUAL_HANDLES)
  const shares = Math.max(1, Math.round(10 ** (1 + rng() * 2.8)))
  return {
    id: randomId('sim'),
    ts: now,
    user,
    action: rng() < 0.8 ? 'buy' : 'sell',
    side,
    sideLabel: market.labels[side],
    shares,
    price,
    marketId: market.id,
    marketTitle: market.title,
    sim: true,
  }
}
