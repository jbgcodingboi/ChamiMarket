/**
 * Keeps the Supabase backend's market data current. Runs every few minutes
 * in .github/workflows/sync-backend.yml with the project's service role key:
 *
 *  1. Prices: the curated Polymarket listing, Chaminade house markets and the
 *     Quick markets (crypto, local weather, stocks) are upserted into
 *     the `markets` table. Trades are priced from it (Polymarket trades also
 *     check the live API), and the app lists Chaminade and Quick markets from it.
 *  2. Results: every market someone holds is checked against its official
 *     source (Polymarket, the Chaminade calendar, Coinbase, the National
 *     Weather Service, daily closes, ESPN) and settled on the server.
 *  3. Equity snapshots for every player's chart.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Without them it exits
 * quietly, so the workflow is harmless until the backend is set up.
 */
import { fetchCatalog, fetchMarketById, fetchRecentResolutions } from '../src/services/gamma.js'
import { houseOutcome, isHouseId } from '../src/services/chaminade.js'
import { buildCoinMarkets, COINS, cryptoOutcome, fetchCandles, fetchCoinData, parseCryptoId } from '../src/services/quick/crypto.js'
import { espnOutcome, fetchGamesFor, isEspnSettleable } from '../src/services/quick/espn.js'
import { parlayOutcome, parseParlayId } from '../src/services/quick/parlays.js'
import { buildStockMarkets, parseStockId, stockOutcome } from '../src/services/quick/stocks.js'
import { buildWeatherMarkets, fetchClimateReports, fetchForecast, parseWeatherId, STATIONS, weatherOutcome } from '../src/services/quick/weather.js'
import { curate } from '../src/utils/curation.js'
import { fetchChaminade, fetchStockCloses, USER_AGENT } from './sources.mjs'

const BASE = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!BASE || !KEY) {
  console.log('sync skipped: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set')
  process.exit(0)
}
// The service key must only ever travel over https (plain http is allowed for a local test server).
if (!/^https:\/\//.test(BASE) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error('sync stopped: SUPABASE_URL must start with https://')
  process.exit(1)
}

// Some public APIs (the National Weather Service in particular) require a User-Agent.
const nativeFetch = globalThis.fetch
globalThis.fetch = (url, init = {}) => nativeFetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } })

// Legacy service_role keys are JWTs and go in both headers; newer sb_secret_ keys go in apikey only.
const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('eyJ') && { Authorization: `Bearer ${KEY}` }) }

async function rpc(name, args) {
  const res = await nativeFetch(`${BASE}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args ?? {}) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

async function select(table, query) {
  const res = await nativeFetch(`${BASE}/rest/v1/${table}?${query}`, { headers })
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

const inList = (ids) => `in.(${ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',')})`

/** Rows whose `column` is one of `ids`, fetched in batches so the URL never gets too long. */
async function selectIn(table, fields, column, ids) {
  const rows = []
  for (let i = 0; i < ids.length; i += 100) rows.push(...(await select(table, `select=${fields}&${column}=${inList(ids.slice(i, i + 100))}`)))
  return rows
}
const settled = (p) => (p.status === 'fulfilled' ? p.value : null)
const now = Date.now()
const log = (msg) => console.log(msg)

// 1. Markets -------------------------------------------------------------------
const [catalog, house, coinData, forecasts, closes] = await Promise.allSettled([
  fetchCatalog({ now }),
  fetchChaminade(now),
  Promise.allSettled(COINS.map((c) => fetchCoinData(c, now))),
  Promise.allSettled(STATIONS.map((s) => fetchForecast(s))),
  fetchStockCloses(now),
])
const polymarket = settled(catalog)?.list ?? []
const houseData = settled(house)
const listing = curate([...polymarket, ...(houseData?.markets ?? [])])
const coins = settled(coinData) ?? []
const weather = settled(forecasts) ?? []
const quick = [
  ...COINS.flatMap((c, i) => (settled(coins[i]) ? buildCoinMarkets(c, settled(coins[i]), now) : [])),
  ...STATIONS.flatMap((s, i) => (settled(weather[i]) ? buildWeatherMarkets(s, settled(weather[i]), now) : [])),
  ...buildStockMarkets(now, settled(closes) ?? {}),
]
for (const [name, p] of Object.entries({ polymarket: catalog, chaminade: house, stocks: closes })) {
  if (p.status === 'rejected') console.warn(`${name} unavailable: ${p.reason?.message ?? p.reason}`)
}

// Held markets that dropped out of the listing still need current prices for valuation.
const held = (await rpc('held_markets')) ?? []
// Legs of parlays opened before parlays were retired still need prices and results.
const legIds = [...new Set(held.flatMap((id) => parseParlayId(id)?.map((l) => l.id) ?? []))]
const listed = new Set([...listing, ...quick].map((m) => m.id))
const lookups = [...new Set([...held.filter((id) => !parseParlayId(id)), ...legIds])]
const heldMeta = await selectIn('markets', 'id,category,league', 'id', lookups)
const metaById = new Map(heldMeta.map((m) => [m.id, m]))
const extra = (
  await Promise.allSettled(
    lookups
      .filter((id) => /^\d+$/.test(id) && !listed.has(id))
      .map((id) => fetchMarketById(id, metaById.get(id)?.category ?? 'sports', { league: metaById.get(id)?.league ?? null })),
  )
)
  .map(settled)
  .filter(Boolean)

const all = [...listing, ...quick, ...extra]
let stored = 0
for (let i = 0; i < all.length; i += 250) stored += await rpc('sync_markets', { p_markets: all.slice(i, i + 250) })
log(`markets: ${polymarket.length} Polymarket, ${houseData?.markets.length ?? 0} Chaminade, ${quick.length} Quick, ${extra.length} held extras; ${stored} stored`)

// 2. Results for held markets -------------------------------------------------
const byId = new Map(all.map((m) => [m.id, m]))
const results = {}
const add = (id, outcome, source) => {
  if (outcome === 'yes' || outcome === 'no' || outcome === 'void') results[id] = { outcome, source, title: byId.get(id)?.title ?? '' }
}

const recent = settled(catalog) ? await fetchRecentResolutions({ tagIds: settled(catalog).tagIds, now }).catch(() => ({})) : {}
const reports = {}
async function outcomeOf(id) {
  if (isHouseId(id)) return houseData ? houseOutcome(id, houseData.results, now) : null
  const crypto = parseCryptoId(id)
  if (crypto) return cryptoOutcome(crypto, await fetchCandles(crypto.coin.product, crypto.start, crypto.end), now)
  const wx = parseWeatherId(id)
  if (wx) {
    reports[wx.station.id] ??= fetchClimateReports(wx.station)
    return weatherOutcome(wx, await reports[wx.station.id], now)
  }
  const stock = parseStockId(id)
  if (stock) return settled(closes) ? stockOutcome(stock, settled(closes), now) : null
  const market = byId.get(id)
  if (market?.resolvedOutcome) return market.resolvedOutcome
  if (recent[id]) return recent[id]
  const kickoff = Date.parse(market?.gameStart ?? market?.endDate ?? '')
  if (market && isEspnSettleable(market) && now > kickoff + 3600e3) return espnOutcome(market, await fetchGamesFor(market))
  return null
}

await Promise.all(
  lookups.map(async (id) => {
    try {
      add(id, await outcomeOf(id), 'sync')
    } catch (err) {
      console.warn(`result check failed for ${id}: ${err.message}`)
    }
  }),
)
// Parlays settle from their legs, using results already on the server as well.
const known = await selectIn('resolutions', 'market_id,outcome', 'market_id', legIds)
const legOutcome = new Map(known.map((r) => [r.market_id, r.outcome]))
for (const id of held) {
  const legs = parseParlayId(id)
  if (!legs) continue
  add(id, parlayOutcome(legs, legs.map((l) => results[l.id]?.outcome ?? legOutcome.get(l.id) ?? null)), 'parlay')
}
const heldSet = new Set(held)
const toSettle = Object.fromEntries(Object.entries(results).filter(([id]) => heldSet.has(id)))
const settledCount = Object.keys(toSettle).length ? await rpc('sync_resolutions', { p_results: toSettle }) : 0
log(`results: ${held.length} held markets checked, ${Object.keys(toSettle).length} resolved, ${settledCount} positions settled`)

// 3. Equity snapshots --------------------------------------------------------
log(`snapshots: ${await rpc('sync_snapshots')} players`)
