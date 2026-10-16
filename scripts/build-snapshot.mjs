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
import { fetchCatalog, fetchRecentResolutions } from '../src/services/gamma.js'
import { STOCKS } from '../src/services/quick/stocks.js'
import { fetchChaminade, fetchStockCloses } from './sources.mjs'

const OUT_DIR = new URL('../public/data/', import.meta.url)
const SNAPSHOT_FILE = new URL('snapshot.json', OUT_DIR)
const CHAMINADE_FILE = new URL('chaminade.json', OUT_DIR)
const QUICK_FILE = new URL('quick.json', OUT_DIR)

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
    const { games, markets, results } = await fetchChaminade(now)
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
    const out = await fetchStockCloses(now)
    await writeFile(QUICK_FILE, JSON.stringify({ version: 1, generatedAt: now, stocks: out }))
    const last = (rows) => rows[rows.length - 1]
    console.log(`quick: ${STOCKS.map((s) => `${s.symbol} ${last(out[s.symbol]).date} ${last(out[s.symbol]).close}${last(out[s.symbol]).final ? '' : ' (intraday)'}`).join(', ')}`)
  } catch (err) {
    await rm(QUICK_FILE, { force: true })
    console.warn(`quick skipped: ${err.message}`)
  }
}

await Promise.all([polymarket(), chaminade(), stocks()])
