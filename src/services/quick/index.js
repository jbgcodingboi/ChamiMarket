/**
 * Builds the Quick listing (crypto, local weather, stocks) and
 * settles held Quick markets and tonight's pro games. Every source is
 * independent: one failing never blocks the others.
 */
import { isPlainObject } from '../../utils/storage.js'
import { fetchJson } from '../http.js'
import { isQuickId } from './common.js'
import { buildCoinMarkets, COINS, cryptoOutcome, fetchCandles, fetchCoinData, parseCryptoId } from './crypto.js'
import { espnOutcome, fetchGamesFor, isEspnSettleable } from './espn.js'
import { parseParlayId } from './parlays.js'
import { buildStockMarkets, parseStockId, stockOutcome } from './stocks.js'
import { buildWeatherMarkets, fetchClimateReports, fetchForecast, parseWeatherId, STATIONS, weatherOutcome } from './weather.js'

export { isQuickId, parseParlayId }

export const QUICK_DATA_PATH = 'data/quick.json'

/** Validates data/quick.json ({ generatedAt, stocks: { SPY: [{ date, close, final }] } }). */
export function parseQuickData(data) {
  if (!isPlainObject(data) || !isPlainObject(data.stocks)) return { stocks: {} }
  const stocks = {}
  for (const [symbol, rows] of Object.entries(data.stocks)) {
    if (Array.isArray(rows)) {
      stocks[symbol] = rows.filter(
        (r) => isPlainObject(r) && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.close) && typeof r.final === 'boolean',
      )
    }
  }
  return { stocks }
}

async function fetchQuickData() {
  if (typeof window === 'undefined') return { stocks: {} }
  const url = new URL(QUICK_DATA_PATH, window.location.href.split('#')[0]).href
  return parseQuickData(await fetchJson(url, { memoMs: 60000 }))
}

const settled = (p) => (p.status === 'fulfilled' ? p.value : null)

/**
 * held: market ids the active account holds, with the legs of older parlays expanded.
 * lookup: id -> market (for held markets no longer listed).
 */
export async function loadQuick({ now, held, lookup }) {
  const [coinData, forecasts, quickData] = await Promise.all([
    Promise.allSettled(COINS.map((c) => fetchCoinData(c, now))),
    Promise.allSettled(STATIONS.map((s) => fetchForecast(s))),
    fetchQuickData().catch(() => ({ stocks: {} })),
  ])

  const markets = [
    ...COINS.flatMap((c, i) => (settled(coinData[i]) ? buildCoinMarkets(c, settled(coinData[i]), now) : [])),
    ...STATIONS.flatMap((s, i) => (settled(forecasts[i]) ? buildWeatherMarkets(s, settled(forecasts[i]), now) : [])),
    ...buildStockMarkets(now, quickData.stocks),
  ]

  const results = {}
  const reports = {}
  await Promise.all(
    [...held].map(async (id) => {
      try {
        const crypto = parseCryptoId(id)
        if (crypto) {
          const candles = await fetchCandles(crypto.coin.product, crypto.start, crypto.end)
          results[id] = cryptoOutcome(crypto, candles, now)
          return
        }
        const wx = parseWeatherId(id)
        if (wx) {
          reports[wx.station.id] ??= fetchClimateReports(wx.station)
          results[id] = weatherOutcome(wx, await reports[wx.station.id], now)
          return
        }
        const stock = parseStockId(id)
        if (stock) {
          results[id] = stockOutcome(stock, quickData.stocks, now)
          return
        }
        const market = lookup(id)
        const kickoff = Date.parse(market?.gameStart ?? market?.endDate ?? '')
        if (!isQuickId(id) && isEspnSettleable(market) && now > kickoff + 3600e3) {
          results[id] = espnOutcome(market, await fetchGamesFor(market))
        }
      } catch {
        // Leave this one pending; it is retried on the next refresh.
      }
    }),
  )
  for (const id of Object.keys(results)) if (!results[id]) delete results[id]
  return { markets, results }
}
