import { afterEach, describe, expect, it } from 'vitest'
import { isValidPortfolio } from './portfolio.js'
import { readJSON, removeKey, runMigrations, setStorageBackend, writeJSON } from './storage.js'

function fakeStorage({ failWrites = false } = {}) {
  const data = new Map()
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) throw new Error('QuotaExceededError')
      data.set(k, String(v))
    },
    removeItem: (k) => data.delete(k),
  }
}

afterEach(() => setStorageBackend(null))

describe('storage', () => {
  it('round-trips namespaced JSON', () => {
    const backend = fakeStorage()
    setStorageBackend(backend)
    writeJSON('thing', { a: 1 })
    expect(backend.data.get('redbook:thing')).toBe('{"a":1}')
    expect(readJSON('thing', null, null)).toEqual({ a: 1 })
    removeKey('thing')
    expect(readJSON('thing', null, 'fallback')).toBe('fallback')
  })

  it('drops corrupted or invalid values and returns the fallback', () => {
    const backend = fakeStorage()
    setStorageBackend(backend)
    backend.setItem('redbook:portfolio:x', '{not json')
    expect(readJSON('portfolio:x', isValidPortfolio, null)).toBeNull()
    expect(backend.data.has('redbook:portfolio:x')).toBe(false)
    backend.setItem('redbook:portfolio:y', JSON.stringify({ cash: 'NaN' }))
    expect(readJSON('portfolio:y', isValidPortfolio, null)).toBeNull()
    expect(backend.data.has('redbook:portfolio:y')).toBe(false)
  })

  it('falls back to memory when writes fail (private mode, quota)', () => {
    setStorageBackend(fakeStorage({ failWrites: true }))
    expect(writeJSON('k', [1, 2])).toBe(false)
    expect(readJSON('k', Array.isArray, [])).toEqual([1, 2])
  })

  it('stamps the schema version', () => {
    const backend = fakeStorage()
    setStorageBackend(backend)
    runMigrations()
    expect(backend.data.get('redbook:schema')).toBe('1')
  })
})
