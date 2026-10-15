import { REQUEST_TIMEOUT_MS } from '../config.js'

/**
 * Small fetch wrapper tuned for public, rate-limited APIs:
 *  - request timeout via AbortController
 *  - in-flight de-duplication (identical URLs share one request)
 *  - a short response memo so bursts of identical calls hit the network once
 *  - per-host sliding-window budget plus a cooldown after HTTP 429
 */
export class HttpError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

const inflight = new Map()
const memo = new Map()
const cooldownUntil = new Map()
const requestLog = new Map()

const WINDOW_MS = 10000
const MAX_REQUESTS_PER_WINDOW = 30
const DEFAULT_COOLDOWN_MS = 60000
const MEMO_LIMIT = 100

function withinBudget(host, now) {
  const log = (requestLog.get(host) ?? []).filter((t) => now - t < WINDOW_MS)
  requestLog.set(host, log)
  if (log.length >= MAX_REQUESTS_PER_WINDOW) return false
  log.push(now)
  return true
}

export async function fetchJson(url, { timeoutMs = REQUEST_TIMEOUT_MS, memoMs = 4000 } = {}) {
  const host = new URL(url).host
  const now = Date.now()
  if (now < (cooldownUntil.get(host) ?? 0)) throw new HttpError('Rate limited, cooling down', 429)

  const hit = memo.get(url)
  if (hit && now - hit.t < memoMs) return hit.data
  if (inflight.has(url)) return inflight.get(url)
  if (!withinBudget(host, now)) throw new HttpError('Local request budget exceeded', 429)

  const request = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'))
        cooldownUntil.set(host, Date.now() + (retryAfter > 0 ? retryAfter * 1000 : DEFAULT_COOLDOWN_MS))
        throw new HttpError('Rate limited', 429)
      }
      if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status)
      const data = await res.json()
      memo.set(url, { t: Date.now(), data })
      if (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value)
      return data
    } catch (err) {
      if (err instanceof HttpError) throw err
      if (err?.name === 'AbortError') throw new HttpError('Request timed out', 0)
      throw new HttpError(err?.message || 'Network error', 0)
    } finally {
      clearTimeout(timer)
      inflight.delete(url)
    }
  })()
  inflight.set(url, request)
  return request
}
