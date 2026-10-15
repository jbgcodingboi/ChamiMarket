import { CLOB_BASE } from '../config.js'
import { fetchJson } from './http.js'
import { normalizeOrderBook, normalizePriceHistory } from './normalize.js'

export const CHART_RANGES = [
  { id: '1D', label: '1D', interval: '1d', fidelity: 10, spanMs: 864e5, points: 96 },
  { id: '1W', label: '1W', interval: '1w', fidelity: 60, spanMs: 7 * 864e5, points: 168 },
  { id: '1M', label: '1M', interval: '1m', fidelity: 240, spanMs: 30 * 864e5, points: 180 },
  { id: 'ALL', label: 'All', interval: 'max', fidelity: 720, spanMs: 120 * 864e5, points: 200 },
]

export async function fetchOrderBook(tokenId) {
  const data = await fetchJson(`${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`, { memoMs: 8000 })
  return normalizeOrderBook(data)
}

export async function fetchPriceHistory(tokenId, range) {
  const params = new URLSearchParams({
    market: tokenId,
    interval: range.interval,
    fidelity: String(range.fidelity),
  })
  const data = await fetchJson(`${CLOB_BASE}/prices-history?${params}`, { memoMs: 60000 })
  return normalizePriceHistory(data)
}
