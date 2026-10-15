/**
 * Namespaced, versioned localStorage wrapper.
 *
 * Every read is validated; anything that fails to parse or validate is removed
 * and the caller's fallback is returned, so corrupted storage can never crash
 * the app. When localStorage is unavailable (private mode, disabled cookies,
 * quota exhausted) values are kept in memory for the rest of the session.
 */
const NS = 'redbook:'
const SCHEMA_KEY = 'schema'
const SCHEMA_VERSION = 1

const memory = new Map()

function detectBackend() {
  try {
    const probe = `${NS}__probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

let backend = typeof window === 'undefined' ? null : detectBackend()

/** Test hook: swap in a fake Storage implementation (or null for memory only). */
export function setStorageBackend(next) {
  backend = next
  memory.clear()
}

function readRaw(fullKey) {
  if (memory.has(fullKey)) return memory.get(fullKey)
  if (!backend) return null
  try {
    return backend.getItem(fullKey)
  } catch {
    return null
  }
}

export function removeKey(key) {
  const fullKey = NS + key
  memory.delete(fullKey)
  if (!backend) return
  try {
    backend.removeItem(fullKey)
  } catch {
    // Nothing else to do; the in-memory copy is already gone.
  }
}

export function readJSON(key, validate, fallback) {
  const raw = readRaw(NS + key)
  if (raw == null) return fallback
  try {
    const parsed = JSON.parse(raw)
    if (!validate || validate(parsed)) return parsed
  } catch {
    // Fall through to cleanup below.
  }
  removeKey(key)
  return fallback
}

export function writeJSON(key, value) {
  const fullKey = NS + key
  let raw
  try {
    raw = JSON.stringify(value)
  } catch {
    return false
  }
  if (backend) {
    try {
      backend.setItem(fullKey, raw)
      memory.delete(fullKey)
      return true
    } catch {
      // Quota or security error: keep the value in memory instead.
    }
  }
  memory.set(fullKey, raw)
  return false
}

/** Invokes cb when another tab changes the given key. Returns an unsubscribe. */
export function subscribeToKey(key, cb) {
  if (typeof window === 'undefined') return () => {}
  const fullKey = NS + key
  const handler = (event) => {
    if (event.key === fullKey || event.key === null) cb()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

/**
 * Upgrade steps keyed by the version they upgrade *from*. Each step receives
 * the storage helpers and must leave data valid for version + 1.
 */
const MIGRATIONS = {}

export function runMigrations() {
  const stored = readJSON(SCHEMA_KEY, (v) => Number.isInteger(v) && v >= 0, null)
  let version = stored ?? SCHEMA_VERSION
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (step) {
      try {
        step({ readJSON, writeJSON, removeKey })
      } catch {
        // A failed migration should not brick the app; validators will
        // discard anything left in an unexpected shape.
      }
    }
    version += 1
  }
  writeJSON(SCHEMA_KEY, SCHEMA_VERSION)
}

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
