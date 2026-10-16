/**
 * Fetches the curated listing and recent market results from the Polymarket
 * Gamma API and writes them to public/data/snapshot.json, which the build
 * ships with the site. Runs in the scheduled deploy workflow, where the API is
 * reachable even if a visitor's browser can't call it directly.
 *
 * Never fails the build: on any error it leaves no snapshot behind and the app
 * falls back to its other data sources.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { fetchCatalog, fetchRecentResolutions } from '../src/services/gamma.js'

const OUT_DIR = new URL('../public/data/', import.meta.url)
const OUT_FILE = new URL('snapshot.json', OUT_DIR)

try {
  const now = Date.now()
  const { tagIds, list } = await fetchCatalog({ now })
  const resolutions = await fetchRecentResolutions({ tagIds, now }).catch(() => ({}))
  if (!list.length) throw new Error('empty listing')
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, JSON.stringify({ version: 1, generatedAt: now, tagIds, markets: list, resolutions }))
  const sports = list.filter((m) => m.category === 'sports').length
  console.log(`snapshot: ${sports} sports, ${list.length - sports} politics, ${Object.keys(resolutions).length} results`)
} catch (err) {
  await rm(OUT_FILE, { force: true })
  console.warn(`snapshot skipped: ${err.message}`)
}
