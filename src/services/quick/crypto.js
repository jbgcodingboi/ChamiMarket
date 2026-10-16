/**
 * Crypto Quick markets from Coinbase Exchange prices (browser-callable):
 *  - "Up or down" over the next 15-minute windows, priced at 50%: over a few
 *    minutes the move is close to a coin flip
 *  - "Above $K at the top of the hour", priced live as a digital option,
 *    P = N(d2), using volatility measured from the last hour of 1-minute candles
 * Settlement uses Coinbase 1-minute candles, so it lands within a minute or
 * two of the window ending.
 */
import { clamp, normalCdf } from '../../utils/math.js'
import { etTime } from '../../utils/time.js'
import { fetchJson } from '../http.js'
import { quickMarket } from './common.js'

export const COINS = [
  { id: 'btc', name: 'Bitcoin', product: 'BTC-USD' },
  { id: 'eth', name: 'Ethereum', product: 'ETH-USD' },
]
const MIN = 60e3
const WINDOW = 15 * MIN
const HOUR = 60 * MIN
const HOURLY_CUTOFF = 15 * MIN
const COINBASE = 'https://api.exchange.coinbase.com'

/** Start times of the next two 15-minute windows; trading closes when a window starts. */
export const upDownStarts = (now) => {
  const first = Math.ceil((now + 1) / WINDOW) * WINDOW
  return [first, first + WINDOW]
}

/** End of the hourly market currently open for trading, or null in the last 15 minutes of the hour. */
export function hourlyEnd(now) {
  const end = Math.ceil((now + 1) / HOUR) * HOUR
  return now < end - HOURLY_CUTOFF ? end : null
}

/** A round strike spacing near 0.2% of the price ($250 for BTC near $80k, $10 for ETH near $4k). */
export function strikeStep(price) {
  const raw = price * 0.002
  const p = 10 ** Math.floor(Math.log10(raw))
  return [1, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw)
}

/** Two strikes bracketing the hour's opening price. */
export function strikesFor(open) {
  const step = strikeStep(open)
  const lo = Math.floor(open / step) * step
  return [lo, lo + step]
}

/** Probability the price finishes above the strike (lognormal, zero drift). */
export function probAbove(spot, strike, sigmaPerMinute, minutes) {
  if (minutes <= 0) return spot > strike ? 1 : 0
  const s = sigmaPerMinute * Math.sqrt(minutes)
  return normalCdf((Math.log(spot / strike) - (s * s) / 2) / s)
}

/** Per-minute volatility from candles ([time, low, high, open, close, volume], newest first). */
export function sigmaFromCandles(candles) {
  const closes = [...candles].sort((a, b) => a[0] - b[0]).map((c) => c[4])
  const rets = []
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]))
  if (rets.length < 10) return 0.0008
  const m = rets.reduce((a, b) => a + b, 0) / rets.length
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1))
  return clamp(sd, 0.0002, 0.005)
}

const usd = (v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: v < 100 ? 2 : 0 })}`
const sec = (ms) => Math.round(ms / 1000)

export const upDownId = (coin, start) => `q-${coin}-ud15-${sec(start)}`
export const aboveId = (coin, strike, end) => `q-${coin}-above-${strike}-${sec(end)}`

/**
 * Markets for one coin. `data` is { spot, sigma, hourOpen } where hourOpen is
 * the price at the start of the current hour (null if not known yet).
 */
export function buildCoinMarkets(coin, data, now) {
  const markets = []
  for (const start of upDownStarts(now)) {
    const end = start + WINDOW
    markets.push(
      quickMarket({
        id: upDownId(coin.id, start),
        title: `${coin.name} up or down, ${etTime(start)}–${etTime(end)} ET?`,
        eventTitle: `${coin.name} · 15-minute window`,
        description: `Resolves Up if the ${coin.name} price (Coinbase ${coin.product}) at ${etTime(end)} ET is greater than or equal to the price at ${etTime(start)} ET, using the opening price of the ${etTime(start)} one-minute candle and the closing price of the last one-minute candle before ${etTime(end)}. Otherwise resolves Down. Trading closes when the window starts. Priced at even odds: over 15 minutes the direction is close to a coin flip.`,
        endDate: start,
        createdAt: start - 2 * WINDOW,
        yesPrice: 0.5,
        labels: { yes: 'Up', no: 'Down' },
        avatar: coin.id,
      }),
    )
  }
  const end = hourlyEnd(now)
  if (end && data.hourOpen && data.spot && data.sigma) {
    for (const strike of strikesFor(data.hourOpen)) {
      const minutes = (end - now) / MIN
      markets.push(
        quickMarket({
          id: aboveId(coin.id, strike, end),
          title: `${coin.name} above ${usd(strike)} at ${etTime(end)} ET?`,
          eventTitle: `${coin.name} · now ${usd(data.spot)}`,
          description: `Resolves Yes if the closing price of the last one-minute ${coin.product} candle on Coinbase before ${etTime(end)} ET is above ${usd(strike)}. Trading closes at ${etTime(end - HOURLY_CUTOFF)} ET. Odds update live from the current price and the last hour's volatility.`,
          endDate: end - HOURLY_CUTOFF,
          createdAt: end - HOUR,
          yesPrice: clamp(probAbove(data.spot, strike, data.sigma, minutes), 0.02, 0.98),
          avatar: coin.id,
        }),
      )
    }
  }
  return markets
}

const ID_RE = /^q-(btc|eth)-(ud15|above)-(?:(\d+(?:\.\d+)?)-)?(\d+)$/

/** Parses a crypto market id into what settlement needs. */
export function parseCryptoId(id) {
  const m = ID_RE.exec(id)
  if (!m) return null
  const coin = COINS.find((c) => c.id === m[1])
  if (m[2] === 'ud15') {
    const start = Number(m[4]) * 1000
    return { coin, kind: 'updown', start, end: start + WINDOW }
  }
  const end = Number(m[4]) * 1000
  return { coin, kind: 'above', strike: Number(m[3]), start: end - HOUR, end }
}

/** Outcome from one-minute candles covering the window, or null if not settled yet. */
export function cryptoOutcome(parsed, candles, now) {
  if (!parsed || now < parsed.end + MIN) return null
  const byTime = new Map(candles.map((c) => [c[0] * 1000, c]))
  const last = byTime.get(parsed.end - MIN)
  if (!last) return now > parsed.end + 864e5 ? 'void' : null
  if (parsed.kind === 'above') return last[4] > parsed.strike ? 'yes' : 'no'
  const first = byTime.get(parsed.start)
  if (!first) return now > parsed.end + 864e5 ? 'void' : null
  return last[4] >= first[3] ? 'yes' : 'no'
}

export async function fetchCandles(product, startMs, endMs) {
  const url = `${COINBASE}/products/${product}/candles?granularity=60&start=${new Date(startMs).toISOString()}&end=${new Date(endMs).toISOString()}`
  const rows = await fetchJson(url, { memoMs: 30000 })
  return Array.isArray(rows) ? rows.filter((r) => Array.isArray(r) && r.length >= 5 && r.every(Number.isFinite)) : []
}

export async function fetchCoinData(coin, now) {
  const [ticker, candles] = await Promise.all([
    fetchJson(`${COINBASE}/products/${coin.product}/ticker`, { memoMs: 10000 }),
    fetchCandles(coin.product, now - HOUR - 2 * MIN, now),
  ])
  const spot = Number(ticker?.price)
  const hourStart = Math.floor(now / HOUR) * HOUR
  const open = candles.find((c) => c[0] * 1000 === hourStart)?.[3] ?? null
  return { spot: Number.isFinite(spot) ? spot : null, sigma: sigmaFromCandles(candles), hourOpen: open }
}
