/**
 * Server-side data sources shared by the snapshot and backend sync jobs:
 * sources a browser can't call directly (the Chaminade athletics calendar
 * and Yahoo Finance closes).
 */
import { buildMarkets, buildResults, CALENDAR_ENDPOINT, calendarMonths, parseCalendar } from '../src/services/chaminade.js'
import { parseYahooChart, STOCKS } from '../src/services/quick/stocks.js'

export const USER_AGENT = 'Mozilla/5.0 (compatible; ChamiMarketSnapshot/1.0; +https://github.com/jbgcodingboi/ChamiMarket)'

/** A GET that gives up after 15 seconds, so one slow host can't stall a whole run. */
const get = (url) => fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) })

/** Chaminade house markets and posted results from the school's calendar feed. */
export async function fetchChaminade(now) {
  const days = []
  for (const month of calendarMonths(now)) {
    const url = `${CALENDAR_ENDPOINT}?type=month&sport=0&location=all&date=${encodeURIComponent(month)}`
    const res = await get(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${month}`)
    const body = await res.json()
    if (!Array.isArray(body)) throw new Error(`malformed calendar for ${month}`)
    days.push(...body)
  }
  const games = parseCalendar(days)
  if (!games.length) throw new Error('no games in the calendar')
  return { games, markets: buildMarkets(games, now), results: buildResults(games, now) }
}

/** Recent daily closes for the stock Quick markets: { SPY: [{ date, close, final }] }. */
export async function fetchStockCloses(now) {
  const out = {}
  for (const s of STOCKS) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${s.symbol}?interval=1d&range=10d`
    const res = await get(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${s.symbol}`)
    out[s.symbol] = parseYahooChart(await res.json(), now)
    if (!out[s.symbol].length) throw new Error(`no closes for ${s.symbol}`)
  }
  return out
}
