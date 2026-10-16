import { isSafeKey } from '../utils/safe.js'
import { isPlainObject } from '../utils/storage.js'
import { fetchJson } from './http.js'

export const SNAPSHOT_PATH = 'data/snapshot.json'

const isOutcome = (v) => v === 'yes' || v === 'no'

/**
 * Validates a snapshot produced by scripts/build-snapshot.mjs: a curated
 * listing plus results of recently closed markets.
 */
export function parseSnapshot(data) {
  if (!isPlainObject(data) || !Number.isFinite(data.generatedAt) || !Array.isArray(data.markets)) return null
  const resolutions = {}
  if (isPlainObject(data.resolutions)) {
    for (const [id, outcome] of Object.entries(data.resolutions)) {
      if (isSafeKey(id) && isOutcome(outcome)) resolutions[id] = outcome
    }
  }
  return { generatedAt: data.generatedAt, markets: data.markets, resolutions }
}

/**
 * Same-origin copy of the listing that the deploy workflow refreshes on a
 * schedule. It keeps odds and results flowing when a browser can't reach the
 * Polymarket API directly (CORS, network policy or regional blocks).
 */
export async function fetchSnapshot() {
  if (typeof window === 'undefined') return null
  const url = new URL(SNAPSHOT_PATH, window.location.href.split('#')[0]).href
  return parseSnapshot(await fetchJson(url, { memoMs: 60000 }))
}
