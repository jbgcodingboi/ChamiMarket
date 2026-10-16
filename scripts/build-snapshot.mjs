/**
 * Runs in the scheduled deploy workflow, where outside APIs are reachable
 * even if a visitor's browser can't call them directly, and writes data the
 * build ships with the site:
 *
 *  - public/data/snapshot.json: the curated Polymarket listing plus results of
 *    recently closed markets (Gamma API)
 *  - public/data/chaminade.json: Chaminade High School house markets and game
 *    results (the school's SIDEARM athletics calendar feed)
 *  - public/data/quick.json: daily closes for the stock Quick markets (Yahoo
 *    Finance chart API, which doesn't allow browser requests)
 *
 * Never fails the build: a source that errors leaves no file behind and the
 * app falls back to its other data sources.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { buildMarkets, buildResults, CALENDAR_ENDPOINT, calendarMonths, parseCalendar } from '../src/services/chaminade.js'
import { fetchCatalog, fetchRecentResolutions } from '../src/services/gamma.js'
import { parseYahooChart, STOCKS } from '../src/services/quick/stocks.js'

const OUT_DIR = new URL('../public/data/', import.meta.url)
const SNAPSHOT_FILE = new URL('snapshot.json', OUT_DIR)
const CHAMINADE_FILE = new URL('chaminade.json', OUT_DIR)
const QUICK_FILE = new URL('quick.json', OUT_DIR)
const USER_AGENT = 'Mozilla/5.0 (compatible; ChamiMarketSnapshot/1.0; +https://github.com/jbgcodingboi/ChamiMarket)'

await mkdir(OUT_DIR, { recursive: true })
const now = Date.now()

async function polymarket() {
  try {
    const { tagIds, list } = await fetchCatalog({ now })
    const resolutions = await fetchRecentResolutions({ tagIds, now }).catch(() => ({}))
    if (!list.length) throw new Error('empty listing')
    await writeFile(SNAPSHOT_FILE, JSON.stringify({ version: 1, generatedAt: now, tagIds, markets: list, resolutions }))
    const sports = list.filter((m) => m.category === 'sports').length
    console.log(`snapshot: ${sports} sports, ${list.length - sports} politics, ${Object.keys(resolutions).length} results`)
  } catch (err) {
    await rm(SNAPSHOT_FILE, { force: true })
    console.warn(`snapshot skipped: ${err.message}`)
  }
}

async function chaminade() {
  try {
    const days = []
    for (const month of calendarMonths(now)) {
      const url = `${CALENDAR_ENDPOINT}?type=month&sport=0&location=all&date=${encodeURIComponent(month)}`
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${month}`)
      const body = await res.json()
      if (!Array.isArray(body)) throw new Error(`malformed calendar for ${month}`)
      days.push(...body)
    }
    const games = parseCalendar(days)
    if (!games.length) throw new Error('no games in the calendar')
    const markets = buildMarkets(games, now)
    const results = buildResults(games, now)
    await writeFile(CHAMINADE_FILE, JSON.stringify({ version: 1, generatedAt: now, markets, results }))
    console.log(`chaminade: ${games.length} events, ${markets.length} markets, ${Object.keys(results).length} results`)
    for (const m of markets.slice(0, 12)) console.log(`  ${Math.round(m.yesPrice * 100)}%  ${m.title}`)
  } catch (err) {
    await rm(CHAMINADE_FILE, { force: true })
    console.warn(`chaminade skipped: ${err.message}`)
  }
}

async function stocks() {
  try {
    const out = {}
    for (const s of STOCKS) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${s.symbol}?interval=1d&range=10d`
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${s.symbol}`)
      out[s.symbol] = parseYahooChart(await res.json(), now)
      if (!out[s.symbol].length) throw new Error(`no closes for ${s.symbol}`)
    }
    await writeFile(QUICK_FILE, JSON.stringify({ version: 1, generatedAt: now, stocks: out }))
    const last = (rows) => rows[rows.length - 1]
    console.log(`quick: ${STOCKS.map((s) => `${s.symbol} ${last(out[s.symbol]).date} ${last(out[s.symbol]).close}${last(out[s.symbol]).final ? '' : ' (intraday)'}`).join(', ')}`)
  } catch (err) {
    await rm(QUICK_FILE, { force: true })
    console.warn(`quick skipped: ${err.message}`)
  }
}

await Promise.all([polymarket(), chaminade(), stocks()])
