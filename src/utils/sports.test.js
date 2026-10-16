import { describe, expect, it } from 'vitest'
import { createMockMarkets } from '../services/mockData.js'
import {
  ALL_SPORTS,
  countSports,
  effectiveSport,
  isSportSubcategory,
  OTHER_SPORT,
  SPORT_SUBCATEGORIES,
  sportSubcategory,
  sportTabs,
} from './sports.js'

const mk = (over = {}) => ({ title: '', eventTitle: '', description: '', category: 'sports', league: null, tags: [], ...over })

describe('sportSubcategory', () => {
  it('maps Gamma league codes first', () => {
    const codes = { nfl: 'nfl', cfb: 'cfb', nba: 'nba', mlb: 'mlb', nhl: 'nhl', epl: 'epl', lal: 'laliga', sea: 'seriea', bun: 'bundesliga', fl1: 'ligue1', ucl: 'ucl' }
    for (const [league, id] of Object.entries(codes)) expect(sportSubcategory(mk({ league }))).toBe(id)
  })

  it('prefers the league code over conflicting tags and text', () => {
    expect(sportSubcategory(mk({ league: 'ucl', tags: ['epl'], title: 'Arsenal vs. Chelsea (Premier League)' }))).toBe('ucl')
    expect(sportSubcategory(mk({ league: 'NBA', title: 'Super Bowl' }))).toBe('nba')
  })

  it('falls back to tags when the league is missing or unknown', () => {
    expect(sportSubcategory(mk({ tags: ['sports', 'nfl'] }))).toBe('nfl')
    expect(sportSubcategory(mk({ league: 'xyz', tags: ['sports', 'college-basketball'] }))).toBe('cbb')
    expect(sportSubcategory(mk({ tags: ['sports', 'tennis', 'wimbledon'] }))).toBe('tennis')
    expect(sportSubcategory(mk({ tags: ['ufc'] }))).toBe('mma')
    expect(sportSubcategory(mk({ tags: ['formula 1'] }))).toBe('motorsport')
    expect(sportSubcategory(mk({ tags: ['boxing'] }))).toBe('boxing')
    expect(sportSubcategory(mk({ tags: ['pga-tour'] }))).toBe('golf')
  })

  it('prefers a specific league tag over a generic sport tag', () => {
    expect(sportSubcategory(mk({ tags: ['soccer', 'epl'] }))).toBe('epl')
    expect(sportSubcategory(mk({ tags: ['soccer', 'premier-league', 'champions-league'] }))).toBe('ucl')
    expect(sportSubcategory(mk({ tags: ['soccer', 'ballon-dor'] }))).toBe('soccer')
  })

  it('falls back to title keywords, then the description', () => {
    expect(sportSubcategory(mk({ title: 'Will the Celtics win the 2027 NBA Finals?' }))).toBe('nba')
    expect(sportSubcategory(mk({ title: 'Who wins the Heisman Trophy?' }))).toBe('cfb')
    expect(sportSubcategory(mk({ title: 'March Madness: Will Duke reach the Final Four?' }))).toBe('cbb')
    expect(sportSubcategory(mk({ title: 'Will the Dodgers win the World Series?' }))).toBe('mlb')
    expect(sportSubcategory(mk({ title: 'Stanley Cup champion 2027' }))).toBe('nhl')
    expect(sportSubcategory(mk({ title: 'Will Real Madrid win La Liga?' }))).toBe('laliga')
    expect(sportSubcategory(mk({ title: 'Serie A winner' }))).toBe('seriea')
    expect(sportSubcategory(mk({ title: 'Bundesliga winner' }))).toBe('bundesliga')
    expect(sportSubcategory(mk({ title: 'Ligue 1 winner' }))).toBe('ligue1')
    expect(sportSubcategory(mk({ title: 'Will Sinner win the Australian Open?' }))).toBe('tennis')
    expect(sportSubcategory(mk({ title: 'Will Scheffler win the Masters?' }))).toBe('golf')
    expect(sportSubcategory(mk({ title: 'UFC 320: Jones vs. Aspinall' }))).toBe('mma')
    expect(sportSubcategory(mk({ title: 'Will Usyk keep his WBC title?' }))).toBe('boxing')
    expect(sportSubcategory(mk({ title: 'Monaco Grand Prix winner' }))).toBe('motorsport')
    expect(sportSubcategory(mk({ title: 'Will Verstappen win the 2026 F1 title?' }))).toBe('motorsport')
    expect(sportSubcategory(mk({ title: 'Arsenal vs. Chelsea', description: 'Premier League match.' }))).toBe('epl')
  })

  it('reads the title before the description', () => {
    expect(sportSubcategory(mk({ title: 'Will an English club win the Champions League?', description: 'A Premier League club.' }))).toBe('ucl')
    expect(sportSubcategory(mk({ title: 'Will the Chiefs make the NFL playoffs?', description: 'Unlike the NBA...' }))).toBe('nfl')
  })

  it('does not match keywords inside other words', () => {
    expect(sportSubcategory(mk({ title: 'Will the Aces win the WNBA title?' }))).toBe(OTHER_SPORT)
    expect(sportSubcategory(mk({ title: 'Kentucky Derby winner' }))).toBe(OTHER_SPORT)
  })

  it('puts anything unrecognised under Other, and tolerates missing fields', () => {
    expect(sportSubcategory(mk({ title: 'Will the Tour de France be won by Pogačar?' }))).toBe(OTHER_SPORT)
    expect(sportSubcategory({})).toBe(OTHER_SPORT)
    expect(sportSubcategory(null)).toBe(OTHER_SPORT)
  })

  it('only knows its own ids', () => {
    expect(isSportSubcategory('nfl')).toBe(true)
    expect(isSportSubcategory(OTHER_SPORT)).toBe(true)
    expect(isSportSubcategory(ALL_SPORTS)).toBe(false)
    expect(isSportSubcategory('__proto__')).toBe(false)
    expect(new Set(SPORT_SUBCATEGORIES.map((s) => s.id)).size).toBe(SPORT_SUBCATEGORIES.length)
  })

  it('classifies every bundled demo sports market into a named league', () => {
    const sports = createMockMarkets().filter((m) => m.category === 'sports')
    expect(sports.length).toBeGreaterThan(0)
    for (const m of sports) expect(sportSubcategory(m)).not.toBe(OTHER_SPORT)
  })
})

const list = [
  mk({ id: '1', league: 'nfl' }),
  mk({ id: '2', league: 'nfl' }),
  mk({ id: '3', league: 'epl' }),
  mk({ id: '4', title: 'Kentucky Derby winner' }),
  mk({ id: '5', category: 'chaminade', league: 'chaminade', title: 'Football: Will Chaminade beat Holy Trinity?' }),
  mk({ id: '6', category: 'politics', title: 'Will the NFL commissioner testify?' }),
]

describe('countSports and sportTabs', () => {
  it('counts Sports markets only', () => {
    expect(countSports(list)).toEqual({ nfl: 2, epl: 1, other: 1 })
  })

  it('lists All sports first, then only sub-categories with markets, in fixed order with Other last', () => {
    expect(sportTabs(list)).toEqual([
      { id: 'all', label: 'All sports', count: 4 },
      { id: 'nfl', label: 'NFL', count: 2 },
      { id: 'epl', label: 'Premier League', count: 1 },
      { id: 'other', label: 'Other', count: 1 },
    ])
  })

  it('offers only All sports when there are no Sports markets', () => {
    expect(sportTabs([])).toEqual([{ id: 'all', label: 'All sports', count: 0 }])
  })
})

describe('effectiveSport', () => {
  it('keeps a selection that has markets', () => {
    expect(effectiveSport('nfl', list)).toBe('nfl')
    expect(effectiveSport('other', list)).toBe('other')
  })

  it('falls back to All sports when the selection has no markets or is unknown', () => {
    expect(effectiveSport('nba', list)).toBe(ALL_SPORTS)
    expect(effectiveSport('nfl', [])).toBe(ALL_SPORTS)
    expect(effectiveSport('bogus', list)).toBe(ALL_SPORTS)
    expect(effectiveSport(ALL_SPORTS, list)).toBe(ALL_SPORTS)
  })
})
