import { create } from 'zustand'
import { MAX_FEED_ENTRIES } from '../config.js'
import * as backend from '../services/backend/api.js'
import { BACKEND_ENABLED } from '../services/backend/config.js'
import { isPlainObject, readJSON, writeJSON } from '../utils/storage.js'

const KEY = 'feed'
const MAX_SIM = 60

const isEntry = (e) =>
  isPlainObject(e) &&
  typeof e.id === 'string' &&
  Number.isFinite(e.ts) &&
  typeof e.user === 'string' &&
  (e.action === 'buy' || e.action === 'sell') &&
  Number.isFinite(e.shares) &&
  Number.isFinite(e.price) &&
  typeof e.marketTitle === 'string'

const readFeed = () => {
  const list = readJSON(KEY, Array.isArray, [])
  return list.filter(isEntry).slice(0, MAX_FEED_ENTRIES)
}

/**
 * Activity feed. Real paper trades from every local account live in a shared,
 * capped localStorage list; simulated trades are generated in memory and are
 * always flagged with sim: true.
 */
export const useFeedStore = create((set) => ({
  real: [],
  sim: [],

  load() {
    if (BACKEND_ENABLED) return
    set({ real: readFeed() })
  },

  /** Backend mode: loads recent activity from every player and follows new rows live. */
  async connect() {
    const entries = await backend.recentActivity(MAX_SIM).catch(() => [])
    set({ real: entries })
    return backend
      .subscribeActivity((entry) => set((s) => ({ real: [entry, ...s.real.filter((e) => e.id !== entry.id)].slice(0, MAX_FEED_ENTRIES) })))
      .catch(() => () => {})
  },

  addReal(trade) {
    // The server records activity itself in backend mode.
    if (BACKEND_ENABLED) return
    const entry = {
      id: trade.id,
      ts: trade.ts,
      user: trade.user,
      action: trade.action,
      side: trade.side,
      sideLabel: trade.sideLabel,
      shares: trade.shares,
      price: trade.price,
      marketId: trade.marketId,
      marketTitle: trade.marketTitle,
      sim: false,
    }
    const next = [entry, ...readFeed().filter((e) => e.id !== entry.id)].slice(0, MAX_FEED_ENTRIES)
    writeJSON(KEY, next)
    set({ real: next })
  },

  addSim(entry) {
    set((s) => ({ sim: [entry, ...s.sim].slice(0, MAX_SIM) }))
  },
}))
