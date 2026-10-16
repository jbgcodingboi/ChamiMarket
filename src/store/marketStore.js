import { create } from 'zustand'
import { CATEGORIES, MAX_HELD_MARKET_REFRESH, MAX_KNOWN_MARKETS } from '../config.js'
import { fetchCatalog, fetchMarketById } from '../services/gamma.js'
import { fetchHouse } from '../services/house.js'
import { loadQuick, parseParlayId } from '../services/quick/index.js'
import { createMockMarkets, isMockId } from '../services/mockData.js'
import { fetchSnapshot } from '../services/snapshot.js'
import { curate } from '../utils/curation.js'
import { clamp, isFiniteNumber } from '../utils/math.js'
import { isSafeKey, own } from '../utils/safe.js'
import { isPlainObject, readJSON, writeJSON } from '../utils/storage.js'

const CACHE_KEY = 'markets-cache'
const KNOWN_KEY = 'markets-known'
const CACHE_MAX_AGE_MS = 24 * 3600 * 1000
const SNAPSHOT_MAX_AGE_MS = 12 * 3600 * 1000
const STARTUP_GRACE_MS = 4000
const CATEGORY_IDS = CATEGORIES.map((c) => c.id)

let mockList = createMockMarkets()
const mockById = Object.fromEntries(mockList.map((m) => [m.id, m]))

/** Market images must be https URLs; anything else (including a tampered cache or snapshot) is rejected. */
const isImage = (v) => v === null || v === undefined || (typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v))

export const isMarketShape = (m) =>
  isPlainObject(m) &&
  isSafeKey(m.id) &&
  isImage(m.image) &&
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

const isKnown = (k) => isPlainObject(k) && Object.entries(k).every(([id, m]) => isMarketShape(m) && m.id === id)

/** Keeps object identity for unchanged markets so memoized cards skip re-rendering. */
function mergeListing(prev, list) {
  const markets = {}
  let changed = Object.keys(prev).length !== list.length
  for (const m of list) {
    const old = own(prev, m.id)
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
    const yes = Math.round(clamp(m.yesPrice + shock, 0.07, 0.94) * 1000) / 1000
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

function addToKnown(known, markets, heldIds) {
  let next = { ...known }
  for (const m of markets) {
    delete next[m.id]
    next[m.id] = m
  }
  return boundKnown(next, new Set(heldIds))
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
  snapshotResolutions: {},
  baseList: [],
  houseList: [],
  houseResults: {},
  quickList: [],
  quickResults: {},
  tick: 0,

  /**
   * Sets the visible listing (the main source plus Chaminade house markets),
   * re-applying the curation rules.
   */
  setListing(list, extra) {
    const seen = new Set()
    const combined = [...list, ...get().houseList, ...get().quickList].filter((m) => !seen.has(m.id) && seen.add(m.id))
    const curated = curate(combined)
    set((s) => ({
      baseList: list,
      markets: mergeListing(extra.source === s.source ? s.markets : {}, curated),
      order: curated.map((m) => m.id),
      status: 'ready',
      tick: s.tick + 1,
      ...extra,
    }))
  },

  /**
   * Loads Chaminade house markets and results. They are kept in known markets
   * too, so positions still have a market to show and settle after kickoff.
   */
  async refreshHouse(heldIds = []) {
    const house = await fetchHouse().catch(() => null)
    if (!house) return
    const markets = house.markets.filter(isMarketShape)
    set((s) => ({ houseList: markets, houseResults: house.results, known: addToKnown(s.known, markets, heldIds) }))
    writeJSON(KNOWN_KEY, get().known)
    const s = get()
    if (s.status === 'ready') s.setListing(s.baseList, { source: s.source })
  },

  /**
   * Rebuilds Quick markets (crypto, weather, stocks, parlays), settles held
   * Quick markets and tonight's pro games, and reprices held parlays from
   * their legs' current prices.
   */
  async refreshQuick(heldIds = []) {
    const s0 = get()
    const listing = curate([...s0.baseList, ...s0.houseList])
    const { markets, results } = await loadQuick({ now: Date.now(), listing, held: new Set(heldIds), lookup: getMarket })
    set((s) => {
      let known = addToKnown(s.known, markets, heldIds)
      for (const id of heldIds) {
        const legs = parseParlayId(id)
        const parlay = own(known, id)
        if (!legs || !parlay) continue
        const prices = legs.map((l) => {
          const m = getMarket(l.id)
          return m ? (l.side === 'yes' ? m.yesPrice : m.noPrice) : null
        })
        if (prices.every((p) => p !== null)) {
          const p = Math.round(prices.reduce((a, b) => a * b, 1) * 1e4) / 1e4
          known = { ...known, [id]: { ...parlay, yesPrice: p, noPrice: Math.round((1 - p) * 1e4) / 1e4 } }
        }
      }
      return { quickList: markets, quickResults: { ...s.quickResults, ...results }, known }
    })
    writeJSON(KNOWN_KEY, get().known)
    const s = get()
    if (s.status === 'ready') s.setListing(s.baseList, { source: s.source })
  },

  /** Instant startup from cache (when fresh) without waiting on the network. */
  init() {
    const known = readJSON(KNOWN_KEY, isKnown, {})
    const cache = readJSON(CACHE_KEY, isCache, null)
    set({ known, tagIds: cache?.tagIds ?? null })
    if (cache && Date.now() - cache.savedAt < CACHE_MAX_AGE_MS && cache.markets.length) {
      get().setListing(cache.markets, { source: 'cached', lastUpdated: cache.savedAt })
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
    if (get().source === 'mock') mockList = driftMockList(mockList)
    get().setListing(mockList, { source: 'mock', stale: false, lastUpdated: Date.now() })
  },

  /**
   * Fetches the live curated listing plus any held markets missing from it.
   * Concurrent calls share one in-flight refresh. If the live API is
   * unreachable, falls back to the deployed snapshot, then to fresh cached
   * data, then to demo data.
   */
  refresh(heldIds = []) {
    if (refreshPromise) return refreshPromise
    refreshPromise = (async () => {
      const state = get()
      try {
        const { tagIds, list: fetched, ok } = await fetchCatalog({ tagIds: state.tagIds })
        const hasLiveData = state.source === 'live' || state.source === 'cached'
        const kept = hasLiveData
          ? state.order.map((id) => state.markets[id]).filter((m) => !ok[m.category])
          : []
        const list = [...fetched, ...kept.filter((m) => !fetched.some((f) => f.id === m.id))]
        if (!list.length) throw new Error('No live markets returned')

        const listed = new Set(list.map((m) => m.id))
        const missing = heldIds
          .filter((id) => !listed.has(id) && !isMockId(id) && own(state.known, id))
          .slice(0, MAX_HELD_MARKET_REFRESH)
        const extras = (
          await Promise.allSettled(
            missing.map((id) => {
              const prev = own(state.known, id)
              return fetchMarketById(id, prev.category, { league: prev.league ?? null }).then(
                (m) => m && { ...m, tags: prev.tags ?? [] },
              )
            }),
          )
        )
          .map((r) => (r.status === 'fulfilled' ? r.value : null))
          .filter(Boolean)

        const known = addToKnown(get().known, [...list, ...extras], heldIds)
        set({ known })
        get().setListing(list, { tagIds, source: 'live', stale: false, lastUpdated: Date.now() })
        writeJSON(CACHE_KEY, { savedAt: Date.now(), tagIds, markets: curate(list) })
        writeJSON(KNOWN_KEY, known)
      } catch {
        await get().fallback(heldIds)
      } finally {
        refreshPromise = null
      }
    })()
    return refreshPromise
  },

  /** Live API failed: prefer the deployed snapshot, then fresh live/cached data, then demo data. */
  async fallback(heldIds) {
    const s = get()
    const snapshot = await fetchSnapshot().catch(() => null)
    const snapshotFresh = snapshot && Date.now() - snapshot.generatedAt < SNAPSHOT_MAX_AGE_MS
    const markets = snapshotFresh ? snapshot.markets.filter(isMarketShape) : []
    if (markets.length && (!s.lastUpdated || snapshot.generatedAt >= s.lastUpdated || s.source === 'mock')) {
      set({ known: addToKnown(s.known, markets, heldIds), snapshotResolutions: snapshot.resolutions })
      get().setListing(markets, { source: 'snapshot', stale: false, lastUpdated: snapshot.generatedAt })
      return
    }
    if (snapshot) set({ snapshotResolutions: snapshot.resolutions })
    const cacheFresh = s.lastUpdated && Date.now() - s.lastUpdated < CACHE_MAX_AGE_MS
    if (s.source && s.source !== 'mock' && cacheFresh) {
      get().setListing(s.baseList, { stale: true, source: s.source })
    } else {
      get().loadMock()
    }
  },
}))

/** Looks a market up in the live listing, then known markets, then demo data. */
export function getMarket(id) {
  const s = useMarketStore.getState()
  return own(s.markets, id) ?? own(s.known, id) ?? own(mockById, id) ?? null
}

export const isOrphanedDemoId = (id) => isMockId(id) && !own(mockById, id)

export const useMarket = (id) => useMarketStore((s) => own(s.markets, id) ?? own(s.known, id) ?? own(mockById, id) ?? null)
