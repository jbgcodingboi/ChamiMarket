import { clamp, roundPrice } from '../utils/math.js'
import { createRng, hashString } from '../utils/rng.js'

/**
 * Deterministic synthetic price history for when the API has none. Walks
 * backward from the current price with a seeded RNG, so a given market and
 * range always produce the same shape and the line always ends at "now".
 */
export function syntheticHistory(marketId, currentPrice, range, now = Date.now()) {
  const step = range.spanMs / range.points
  const end = Math.floor(now / step) * step
  const rng = createRng(`${marketId}:${range.id}`)
  const vol = 0.012 + (hashString(marketId) % 10) / 1000
  const anchor = clamp(currentPrice, 0.01, 0.99)
  const points = [{ t: now, p: anchor }]
  let p = anchor
  for (let i = 1; i < range.points; i++) {
    const shock = (rng() - 0.5) * 2 * vol * (range.id === '1D' ? 0.5 : 1)
    const drift = (0.5 - p) * 0.004
    p = clamp(p - shock + drift, 0.01, 0.99)
    points.push({ t: end - i * step, p: roundPrice(p) })
  }
  return points.reverse()
}

/** Synthetic two-sided order book centered on the current price. */
export function syntheticOrderBook(seed, price, levels = 10) {
  const rng = createRng(`${seed}:${Math.round(price * 1000)}`)
  const tick = price < 0.05 || price > 0.95 ? 0.001 : 0.01
  const center = Math.round(price / tick) * tick
  const asks = []
  const bids = []
  for (let i = 1; i <= levels; i++) {
    const ask = roundPrice(center + tick * i)
    const bid = roundPrice(center - tick * i)
    const size = () => Math.round(150 + rng() * rng() * 9000)
    if (ask < 1) asks.push({ price: ask, size: size() })
    if (bid > 0) bids.push({ price: bid, size: size() })
  }
  return { bids, asks, synthetic: true }
}
