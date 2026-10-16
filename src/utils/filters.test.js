import { describe, expect, it } from 'vitest'
import { filterMarkets, sortMarkets } from './filters.js'

const markets = [
  { id: '1', title: 'Will the Celtics win?', eventTitle: '', description: 'NBA finals', category: 'sports', volume: 5, createdAt: '2026-01-02', endDate: '2027-06-01' },
  { id: '2', title: 'House majority', eventTitle: 'Midterms', description: 'Democrats vs Republicans', category: 'politics', volume: 9, createdAt: '2026-03-01', endDate: '2026-11-04' },
  { id: '3', title: 'Senate control', eventTitle: '', description: 'celtic mention', category: 'politics', volume: 1, createdAt: '2025-12-01', endDate: null },
]

describe('filterMarkets', () => {
  it('matches title and description case-insensitively', () => {
    expect(filterMarkets(markets, { query: 'CELTIC' }).map((m) => m.id)).toEqual(['1', '3'])
  })
  it('combines search with category', () => {
    expect(filterMarkets(markets, { query: 'celtic', category: 'politics' }).map((m) => m.id)).toEqual(['3'])
  })
  it('returns nothing for a query without matches', () => {
    expect(filterMarkets(markets, { query: 'curling' })).toEqual([])
  })
})

describe('filterMarkets by sport', () => {
  const base = { eventTitle: '', description: '', tags: [] }
  const sports = [
    { ...base, id: 'a', title: 'Chiefs vs. Bills', category: 'sports', league: 'nfl' },
    { ...base, id: 'b', title: 'Lakers vs. Warriors', category: 'sports', league: 'nba' },
    { ...base, id: 'c', title: 'Will the Chiefs win the Super Bowl?', category: 'sports', league: null, tags: ['nfl'] },
    { ...base, id: 'd', title: 'Football: Will Chaminade beat Holy Trinity?', category: 'chaminade', league: 'chaminade' },
  ]
  const ids = (opts) => filterMarkets(sports, opts).map((m) => m.id)

  it('narrows the Sports category to one sub-category', () => {
    expect(ids({ category: 'sports', sport: 'nfl' })).toEqual(['a', 'c'])
    expect(ids({ category: 'sports', sport: 'nba' })).toEqual(['b'])
  })
  it('shows every Sports market for All sports', () => {
    expect(ids({ category: 'sports', sport: 'all' })).toEqual(['a', 'b', 'c'])
    expect(ids({ category: 'sports' })).toEqual(['a', 'b', 'c'])
  })
  it('ignores the sport outside the Sports category', () => {
    expect(ids({ category: 'all', sport: 'nba' })).toEqual(['a', 'b', 'c', 'd'])
    expect(ids({ category: 'chaminade', sport: 'nfl' })).toEqual(['d'])
  })
  it('combines the sport with search', () => {
    expect(ids({ category: 'sports', sport: 'nfl', query: 'super bowl' })).toEqual(['c'])
  })
})

describe('sortMarkets', () => {
  it('sorts by volume, newest and ending soon', () => {
    expect(sortMarkets(markets, 'volume').map((m) => m.id)).toEqual(['2', '1', '3'])
    expect(sortMarkets(markets, 'newest').map((m) => m.id)).toEqual(['2', '1', '3'])
    expect(sortMarkets(markets, 'ending').map((m) => m.id)).toEqual(['2', '1', '3'])
  })
  it('can list sports ahead of politics', () => {
    expect(sortMarkets(markets, 'volume', undefined, { sportsFirst: true }).map((m) => m.id)).toEqual(['1', '2', '3'])
  })
  it('puts resolved markets last', () => {
    expect(sortMarkets(markets, 'volume', (id) => id === '2').map((m) => m.id)).toEqual(['1', '3', '2'])
  })
})
