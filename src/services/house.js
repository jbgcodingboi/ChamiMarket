import { isPlainObject } from '../utils/storage.js'
import { fetchJson } from './http.js'

export const HOUSE_PATH = 'data/chaminade.json'

const isFact = (f) =>
  isPlainObject(f) && ['W', 'L', 'T', 'void'].includes(f.outcome) && (f.total === null || Number.isFinite(f.total))

/** Validates the Chaminade file written by scripts/build-snapshot.mjs. */
export function parseHouse(data) {
  if (!isPlainObject(data) || !Number.isFinite(data.generatedAt) || !Array.isArray(data.markets)) return null
  const results = {}
  if (isPlainObject(data.results)) {
    for (const [key, fact] of Object.entries(data.results)) if (isFact(fact)) results[key] = fact
  }
  return { generatedAt: data.generatedAt, markets: data.markets, results }
}

/** Chaminade house markets and results, served from the site's own origin. */
export async function fetchHouse() {
  if (typeof window === 'undefined') return null
  const url = new URL(HOUSE_PATH, window.location.href.split('#')[0]).href
  return parseHouse(await fetchJson(url, { memoMs: 60000 }))
}
