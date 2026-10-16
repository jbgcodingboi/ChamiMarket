import { describe, expect, it } from 'vitest'
import { curate } from '../utils/curation.js'
import { createMockMarkets, isMockId } from './mockData.js'

describe('bundled demo data', () => {
  it('passes the curation rules and leans toward sports', () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    const all = createMockMarkets(now)
    expect(curate(all, now)).toHaveLength(all.length)
    const sports = all.filter((m) => m.category === 'sports').length
    expect(sports).toBeGreaterThan(all.length - sports)
  })

  it('drops fixed-date markets after they end but keeps rolling games', () => {
    const later = Date.parse('2027-03-01T12:00:00Z')
    const listed = curate(createMockMarkets(later), later)
    expect(listed.some((m) => m.title.includes('2026 midterms'))).toBe(false)
    expect(listed.some((m) => m.title === 'Chiefs vs. Bills')).toBe(true)
  })

  it('recognizes current and legacy demo ids', () => {
    expect(isMockId('demo-s1')).toBe(true)
    expect(isMockId('mock-s1')).toBe(true)
    expect(isMockId('516710')).toBe(false)
  })
})
