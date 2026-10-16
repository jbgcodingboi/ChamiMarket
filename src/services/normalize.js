/**
 * Defensive parsing for Gamma API payloads. Several fields (outcomes,
 * outcomePrices, clobTokenIds) arrive as JSON-encoded strings, numbers often
 * arrive as strings, and any field can be missing. Everything is validated and
 * a market that cannot be represented safely is dropped (null).
 */
import { roundPrice } from '../utils/math.js'
import { isSafeKey } from '../utils/safe.js'

function parseMaybeJSON(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const toDateString = (v) => {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Gamma's gameStartTime looks like "2026-10-18 17:00:00+00"; normalize it to ISO. */
const toGameStart = (v) => {
  if (typeof v !== 'string' || !v.trim()) return null
  const iso = v.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  return toDateString(iso)
}

const toImage = (v) => (typeof v === 'string' && /^https:\/\//.test(v) ? v : null)

const cleanText = (v, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Detects a clear winner on a closed market from settled outcome prices. */
function detectResolvedOutcome({ closed, yesPrice, noPrice, uma }) {
  if (!closed) return null
  // A closed market can still be proposed or disputed on UMA; only a final result counts.
  if (typeof uma === 'string' && uma && uma !== 'resolved') return null
  if (yesPrice >= 0.99 && noPrice <= 0.01) return 'yes'
  if (noPrice >= 0.99 && yesPrice <= 0.01) return 'no'
  // Polymarket settles canceled events 50-50; here that refunds at cost.
  if (yesPrice === 0.5 && noPrice === 0.5) return 'void'
  return null
}

/** Event tags as lowercase slugs and labels, used to classify leagues and topics. */
function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const out = new Set()
  for (const t of tags) {
    for (const v of [t?.slug, t?.label]) {
      if (typeof v === 'string' && v.trim()) out.add(v.trim().toLowerCase().slice(0, 60))
    }
  }
  return [...out].slice(0, 16)
}

export function normalizeGammaMarket(raw, category, { league = null } = {}) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id) : null
  const title = cleanText(raw.question, 300)
  if (!isSafeKey(id) || !title) return null

  const outcomes = parseMaybeJSON(raw.outcomes)
  if (!outcomes || outcomes.length !== 2 || !outcomes.every((o) => typeof o === 'string' && o.trim())) return null

  const prices = parseMaybeJSON(raw.outcomePrices)?.map(toNumber)
  if (!prices || prices.length !== 2 || prices.some((p) => p === null || p < 0 || p > 1)) return null

  const tokens = parseMaybeJSON(raw.clobTokenIds)
  const tokenIds =
    tokens && tokens.length === 2 && tokens.every((t) => typeof t === 'string' && /^\d+$/.test(t)) ? tokens : null

  const yesPrice = roundPrice(prices[0])
  const noPrice = roundPrice(prices[1])
  const closed = raw.closed === true
  const event = Array.isArray(raw.events) ? raw.events[0] : null

  return {
    id,
    slug: cleanText(raw.slug, 200),
    title,
    description: cleanText(raw.description, 2000),
    eventTitle: cleanText(event?.title, 300),
    category,
    league,
    tags: normalizeTags(event?.tags),
    image: toImage(raw.image) || toImage(raw.icon) || toImage(event?.image),
    labels: { yes: outcomes[0].trim().slice(0, 100), no: outcomes[1].trim().slice(0, 100) },
    yesPrice,
    noPrice,
    tokenIds,
    volume: toNumber(raw.volumeNum) ?? toNumber(raw.volume) ?? 0,
    volume24h: toNumber(raw.volume24hr) ?? 0,
    liquidity: toNumber(raw.liquidityNum) ?? toNumber(raw.liquidity) ?? 0,
    endDate: toDateString(raw.endDate) || toDateString(event?.endDate),
    createdAt: toDateString(raw.createdAt) || toDateString(raw.startDate),
    gameStart: toGameStart(raw.gameStartTime),
    active: raw.active !== false,
    closed,
    acceptingOrders: raw.acceptingOrders !== false,
    resolvedOutcome: detectResolvedOutcome({ closed, yesPrice, noPrice, uma: raw.umaResolutionStatus }),
    source: 'live',
  }
}

/** A market is listable when it is open, priced inside (0, 1) and liquid. */
export function isListable(market, minLiquidity) {
  return (
    market.active &&
    !market.closed &&
    market.yesPrice > 0 &&
    market.yesPrice < 1 &&
    market.noPrice > 0 &&
    market.noPrice < 1 &&
    market.liquidity >= minLiquidity
  )
}

export function normalizeOrderBook(raw) {
  if (!raw || typeof raw !== 'object') return null
  const side = (levels) =>
    (Array.isArray(levels) ? levels : [])
      .map((l) => ({ price: toNumber(l?.price), size: toNumber(l?.size) }))
      .filter((l) => l.price !== null && l.size !== null && l.price > 0 && l.price < 1 && l.size > 0)
  const bids = side(raw.bids).sort((a, b) => b.price - a.price)
  const asks = side(raw.asks).sort((a, b) => a.price - b.price)
  if (!bids.length && !asks.length) return null
  return { bids, asks, synthetic: false }
}

export function normalizePriceHistory(raw) {
  const list = Array.isArray(raw?.history) ? raw.history : null
  if (!list) return null
  const points = list
    .map((pt) => ({ t: toNumber(pt?.t), p: toNumber(pt?.p) }))
    .filter((pt) => pt.t !== null && pt.p !== null && pt.p >= 0 && pt.p <= 1)
    .map((pt) => ({ t: pt.t < 1e12 ? pt.t * 1000 : pt.t, p: pt.p }))
    .sort((a, b) => a.t - b.t)
  return points.length >= 2 ? points : null
}
