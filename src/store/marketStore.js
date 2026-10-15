import { create } from 'zustand'
import { CATEGORIES, MAX_HELD_MARKET_REFRESH, MAX_KNOWN_MARKETS } from '../config.js'
import { discoverTagIds, fetchCategoryMarkets, fetchMarketById } from '../services/gamma.js'
import { createMockMarkets, isMockId } from '../services/mockData.js'
import { clamp, isFiniteNumber } from '../utils/math.js'
import { isPlainObject, readJSON, writeJSON } from '../utils/storage.js'

const CACHE_KEY = 'markets-cache'
const KNOWN_KEY = 'markets-known'
const CACHE_MAX_AGE_MS = 24 * 3600 * 1000
const STARTUP_GRACE_MS = 4000
const CATEGORY_IDS = CATEGORIES.map((c) => c.id)

const mockMarkets = createMockMarkets()
const mockById = Object.fromEntries(mockMarkets.map((m) => [m.id, m]))

const isMarketShape = (m) =>
  isPlainObject(m) &&
  typeof m.id === 'string' &&
  typeof m.title === 'string' &&
  CATEGORY_IDS.includes(m.category) &&
  isFiniteNumber(m.yesPrice) &&
  isFiniteNumber(m.noPrice) &&
  m.yesPrice >= 0 &&
  m.yesPrice <= 1 &&
  m.noPrice >= 0 &&
  m.noPrice <= 1 &&
  isPlainObject(m.labels)

const isCache = (c) =>
  isPlainObject(c) &&
  isFiniteNumber(c.savedAt) &&
  Array.isArray(c.markets) &&
  c.markets.every(isMarketShape) &&
  (c.tagIds === null || isPlainObject(c.tagIds))

const isKnown = (k) => isPlainObject(k) && Object.values(k).every(isMarketShape)

/** Keeps object identity for unchanged markets so memoized cards skip re-rendering. */
function mergeListing(prev, list) {
  const markets = {}
  let changed = Object.keys(prev).length !== list.length
  for (const m of list) {
    const old = prev[m.id]
    const same =
      old &&
      old.yesPrice === m.yesPrice &&
      old.noPrice === m.noPrice &&
      old.volume === m.volume &&
      old.closed === m.closed &&
      old.liquidity === m.liquidity &&
      old.title === m.title
    markets[m.id] = same ? old : m
    if (!same) changed = true
  }
  return changed ? markets : prev
}

/** Random walk applied to offline demo prices so the app still feels alive. */
function driftMockList(list) {
  return list.map((m) => {
    if (Math.random() < 0.45) return m
    const shock = (Math.random() + Math.random() + Math.random() - 1.5) * 0.012
    const yes = Math.round(clamp(m.yesPrice + shock, 0.02, 0.98) * 1000) / 1000
    return {
      ...m,
      yesPrice: yes,
      noPrice: Math.round((1 - yes) * 1000) / 1000,
      volume: Math.round(m.volume + Math.random() * 2500),
    }
  })
}

function boundKnown(known, keepIds) {
  const ids = Object.keys(known)
  if (ids.length <= MAX_KNOWN_MARKETS) return known
  const next = { ...known }
  for (const id of ids) {
    if (Object.keys(next).length <= MAX_KNOWN_MARKETS) break
    if (!keepIds.has(id)) delete next[id]
  }
  return next
}

let refreshPromise = null

export const useMarketStore = create((set, get) => ({
  status: 'loading',
  source: null,
  stale: false,
  markets: {},
  order: [],
  known: {},
  tagIds: null,
  lastUpdated: null,
  tick: 0,

  /** Instant startup from cache (when fresh) without waiting on the network. */
  init() {
    const known = readJSON(KNOWN_KEY, isKnown, {})
    const cache = readJSON(CACHE_KEY, isCache, null)
    if (cache && Date.now() - cache.savedAt < CACHE_MAX_AGE_MS && cache.markets.length) {
      set({
        known,
        markets: Object.fromEntries(cache.markets.map((m) => [m.id, m])),
        order: cache.markets.map((m) => m.id),
        tagIds: cache.tagIds,
        source: 'cached',
        status: 'ready',
        lastUpdated: cache.savedAt,
      })
    } else {
      set({ known, tagIds: cache?.tagIds ?? null })
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false && get().status !== 'ready') {
      get().loadMock()
    }
    // Never hold the UI on a slow network: show demo data after a short wait;
    // a successful live refresh replaces it as soon as it lands.
    setTimeout(() => {
      if (get().status === 'loading') get().loadMock()
    }, STARTUP_GRACE_MS)
  },

  loadMock() {
    const state = get()
    const base = state.source === 'mock' ? state.order.map((id) => state.markets[id]) : mockMarkets
    const list = state.source === 'mock' ? driftMockList(base) : base
    set((s) => ({
      markets: mergeListing(s.source === 'mock' ? s.markets : {}, list),
      order: list.map((m) => m.id),
      source: 'mock',
      stale: false,
      status: 'ready',
      lastUpdated: Date.now(),
      tick: s.tick + 1,
    }))
  },

  /**
   * Fetches live listings for both categories plus any held markets missing
   * from them. Concurrent calls share one in-flight refresh. On failure, keeps
   * fresh cached/live data if present, otherwise falls back to demo data.
   */
  refresh(heldIds = []) {
    if (refreshPromise) return refreshPromise
    refreshPromise = (async () => {
      const state = get()
      try {
        const tagIds = state.tagIds ?? (await discoverTagIds())
        const results = await Promise.allSettled(
          CATEGORIES.map((c) => fetchCategoryMarkets(c.id, tagIds[c.id])),
        )
        if (!results.some((r) => r.status === 'fulfilled')) throw results[0].reason
        const hasLiveData = state.source === 'live' || state.source === 'cached'
        const seen = new Set()
        const list = []
        results.forEach((r, i) => {
          const rows =
            r.status === 'fulfilled'
              ? r.value
              : hasLiveData
                ? state.order.map((id) => state.markets[id]).filter((m) => m.category === CATEGORIES[i].id)
                : []
          for (const m of rows) {
            if (!seen.has(m.id)) {
              seen.add(m.id)
              list.push(m)
            }
          }
        })
        if (!list.length) throw new Error('No live markets returned')

        const missing = heldIds
          .filter((id) => !seen.has(id) && !isMockId(id) && state.known[id])
          .slice(0, MAX_HELD_MARKET_REFRESH)
        const extras = (
          await Promise.allSettled(missing.map((id) => fetchMarketById(id, state.known[id].category)))
        )
          .map((r) => (r.status === 'fulfilled' ? r.value : null))
          .filter(Boolean)

        let known = { ...get().known }
        for (const m of [...list, ...extras]) {
          delete known[m.id]
          known[m.id] = m
        }
        known = boundKnown(known, new Set(heldIds))

        set((s) => ({
          markets: mergeListing(s.source === 'mock' ? {} : s.markets, list),
          order: list.map((m) => m.id),
          known,
          tagIds,
          source: 'live',
          stale: false,
          status: 'ready',
          lastUpdated: Date.now(),
          tick: s.tick + 1,
        }))
        writeJSON(CACHE_KEY, { savedAt: Date.now(), tagIds, markets: list })
        writeJSON(KNOWN_KEY, known)
      } catch {
        const s = get()
        const cacheFresh = s.lastUpdated && Date.now() - s.lastUpdated < CACHE_MAX_AGE_MS
        if ((s.source === 'live' || s.source === 'cached') && cacheFresh) {
          set({ stale: true })
        } else {
          get().loadMock()
        }
      } finally {
        refreshPromise = null
      }
    })()
    return refreshPromise
  },
}))

/** Looks a market up in the live listing, then known markets, then demo data. */
export function getMarket(id) {
  const s = useMarketStore.getState()
  return s.markets[id] ?? s.known[id] ?? mockById[id] ?? null
}

export const useMarket = (id) => useMarketStore((s) => s.markets[id] ?? s.known[id] ?? mockById[id] ?? null)
