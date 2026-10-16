import { create } from 'zustand'
import { isSafeKey, own } from '../utils/safe.js'
import { isPlainObject, readJSON, writeJSON } from '../utils/storage.js'

const KEY = 'resolutions'

const isResolutions = (v) =>
  isPlainObject(v) &&
  Object.keys(v).every(isSafeKey) &&
  Object.values(v).every(
    (r) => isPlainObject(r) && (r.outcome === 'yes' || r.outcome === 'no' || r.outcome === 'void') && Number.isFinite(r.at),
  )

/**
 * Market resolutions shared by every local account. Each account's positions
 * are settled against this list when it loads, so resolving a market while one
 * user is logged in still pays out everyone else on their next login.
 */
export const useResolutionStore = create((set, get) => ({
  resolutions: {},

  load() {
    set({ resolutions: readJSON(KEY, isResolutions, {}) })
  },

  /** Records a resolution once. Returns false if the market was already resolved. */
  resolve(marketId, outcome, { source = 'api', title = '' } = {}) {
    const current = readJSON(KEY, isResolutions, {})
    if (!isSafeKey(marketId) || own(current, marketId) || own(get().resolutions, marketId)) return false
    const next = { ...current, [marketId]: { outcome, at: Date.now(), source, title } }
    writeJSON(KEY, next)
    set({ resolutions: next })
    return true
  },
}))

export const useResolution = (marketId) => useResolutionStore((s) => own(s.resolutions, marketId) ?? null)
