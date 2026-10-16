import { describe, expect, it } from 'vitest'
import {
  buildMarkets,
  buildResults,
  calendarMonths,
  easternToUtc,
  houseOutcome,
  parseCalendar,
  winModel,
} from './chaminade.js'

// Shaped like the SIDEARM responsive-calendar feed; results are Chaminade's real 2026 fall games.
let nextId = 3000
const ev = (date, sport, opponent, loc, status = 'O', result = null) => ({
  id: nextId++,
  date,
  time: '7:00 PM',
  location_indicator: loc,
  status,
  sport: { title: sport },
  opponent: { title: opponent },
  result: result ? { status: result[0], team_score: String(result[1]), opponent_score: String(result[2]) } : { status: status === 'O' ? 'N' : null },
})
const FB = 'Varsity Football'
const SOC = 'Varsity Soccer'
const feed = [
  {
    date: '2026-09-01T00:00:00',
    events: [
      ev('2026-09-05T18:00:00', FB, 'Bishop Hendricken', 'A', 'O', ['W', 18, 17]),
      ev('2026-09-12T13:30:00', FB, 'Seton Hall Prep', 'H', 'O', ['L', 11, 30]),
      ev('2026-09-19T13:30:00', FB, 'Msgr. Farrell', 'H', 'O', ['L', 3, 28]),
      ev('2026-09-25T16:00:00', FB, 'St. Francis Prep', 'H', 'O', ['W', 25, 18]),
      ev('2026-10-04T13:30:00', FB, 'Cardinal Hayes', 'H', 'O', ['L', 9, 15]),
      ev('2026-10-10T13:30:00', FB, 'Stepinac', 'H', 'O', ['L', 23, 28]),
      ev('2026-09-29T19:00:00', SOC, "St. Anthony's", 'A', 'O', ['L', 1, 3]),
      ev('2026-10-02T18:00:00', SOC, 'Northport', 'H', 'O', ['W', 4, 1]),
      ev('2026-10-06T16:30:00', SOC, "St. Dominic's", 'A', 'O', ['W', 4, 0]),
      ev('2026-10-08T16:30:00', SOC, 'Kellenberg', 'H', 'O', ['W', 4, 0]),
      ev('2026-10-11T12:00:00', SOC, 'LaSalle Academy', 'A', 'O', ['L', 1, 2]),
      ev('2026-10-13T16:30:00', SOC, "St. Mary's", 'H', 'O', ['W', 6, 0]),
      ev('2026-09-26T17:30:00', SOC, "St. Benedict's Prep", 'A', 'P'),
      ev('2026-10-10T09:00:00', 'Varsity & JV Cross Country', 'Manhattan University XC Invitational', 'N', 'O'),
    ],
  },
  {
    date: '2026-10-16T00:00:00',
    events: [
      ev('2026-10-16T19:00:00', FB, "St. Anthony's", 'A', 'A'),
      ev('2026-10-22T16:30:00', SOC, "St. Anthony's", 'H', 'A'),
      ev('2026-10-25T09:00:00', 'Varsity & JV Cross Country', 'NSCHSAA Varsity/JV Championships', 'N', 'A'),
      ev('2026-12-05T16:00:00', 'Varsity Basketball', 'Iona Prep', 'A', 'A'),
    ],
  },
]
const NOW = Date.parse('2026-10-16T01:00:00Z')
const games = parseCalendar(feed)

describe('feed parsing', () => {
  it('converts Eastern wall-clock times to UTC across DST', () => {
    expect(new Date(easternToUtc('2026-10-16T19:00:00')).toISOString()).toBe('2026-10-16T23:00:00.000Z')
    expect(new Date(easternToUtc('2026-12-05T16:00:00')).toISOString()).toBe('2026-12-05T21:00:00.000Z')
  })
  it('reads results, scores, home/away and statuses', () => {
    const hendricken = games.find((g) => g.opponent === 'Bishop Hendricken')
    expect(hendricken).toMatchObject({ home: 'away', result: 'W', teamScore: 18, oppScore: 17, status: 'O' })
    expect(games.find((g) => g.opponent === "St. Benedict's Prep").status).toBe('P')
  })
  it('requests enough months for the season plus the listing window', () => {
    expect(calendarMonths(NOW)).toEqual(['5/1/2026', '6/1/2026', '7/1/2026', '8/1/2026', '9/1/2026', '10/1/2026'])
  })
})

describe('odds model', () => {
  it('makes a 2-4 football team an underdog on the road', () => {
    const g = games.find((x) => x.sport === FB && x.status === 'A')
    const { probability } = winModel(games, g)
    expect(probability).toBeGreaterThanOrEqual(0.15)
    expect(probability).toBeLessThan(0.4)
  })
  it('weighs the earlier loss to the same opponent in soccer', () => {
    const g = games.find((x) => x.sport === SOC && x.status === 'A')
    const withH2H = winModel(games, g)
    const without = winModel(games.filter((x) => !(x.sport === SOC && x.opponent === "St. Anthony's" && x.status === 'O')), g)
    expect(withH2H.h2h).toBe(1)
    expect(withH2H.probability).toBeLessThan(without.probability)
  })
  it('never lists long shots or near-locks', () => {
    const blowouts = parseCalendar([
      { events: Array.from({ length: 8 }, (_, i) => ev(`2026-09-${10 + i}T16:00:00`, 'JV Football', `Team ${i}`, 'H', 'O', ['W', 49, 0])) },
      { events: [ev('2026-10-20T16:00:00', 'JV Football', 'Next', 'H', 'A')] },
    ])
    const g = blowouts.find((x) => x.status === 'A')
    expect(winModel(blowouts, g).probability).toBe(0.85)
  })
})

describe('markets', () => {
  const markets = buildMarkets(games, NOW)
  it('lists head-to-head games in the next two weeks only', () => {
    const titles = markets.map((m) => m.title)
    expect(titles).toContain("Varsity Football: Will Chaminade beat St. Anthony's?")
    expect(titles).toContain("Varsity Soccer: Will Chaminade beat St. Anthony's?")
    expect(titles.some((t) => /Cross Country|Basketball/.test(t))).toBe(false)
  })
  it('adds an over/under near the season average total', () => {
    const ou = markets.find((m) => m.id.includes('-ou-') && m.title.startsWith(FB))
    // Totals: 35, 41, 31, 43, 24, 51 -> average 37.5 -> line 37.5
    expect(ou.title).toBe("Varsity Football: Chaminade at St. Anthony's, over 37.5 total points?")
    expect(ou.yesPrice).toBeGreaterThan(0.4)
    expect(ou.yesPrice).toBeLessThan(0.6)
  })
  it('closes trading at the scheduled start', () => {
    const m = markets.find((x) => x.title.startsWith(FB))
    expect(m.endDate).toBe('2026-10-16T23:00:00.000Z')
    expect(m.category).toBe('chaminade')
    expect(m.yesPrice + m.noPrice).toBeCloseTo(1, 4)
  })
})

describe('results and settlement', () => {
  const later = Date.parse('2026-10-17T12:00:00Z')
  const fb = games.find((x) => x.sport === FB && x.status === 'A')
  const played = parseCalendar([{ events: [{ ...feed[1].events[0], status: 'O', result: { status: 'L', team_score: '21', opponent_score: '35' } }] }])
  const all = [...games.filter((g) => g.id !== fb.id), ...played]
  const results = buildResults(all, later)
  const win = buildMarkets(games, NOW).find((m) => m.title.startsWith(FB) && m.id.endsWith('-win'))
  const ou = buildMarkets(games, NOW).find((m) => m.title.startsWith(FB) && m.id.includes('-ou-'))

  it('settles winner and over/under markets from the final score', () => {
    expect(houseOutcome(win.id, results)).toBe('no')
    expect(houseOutcome(ou.id, results)).toBe('yes') // 56 > 37.5
  })
  it('voids canceled or postponed games', () => {
    const benedicts = games.find((g) => g.opponent === "St. Benedict's Prep")
    const res = buildResults(games, NOW)
    const key = `cham-${benedicts.id}-20260926`
    expect(res[key]).toEqual({ outcome: 'void', total: null })
    expect(houseOutcome(`${key}-win`, res)).toBe('void')
  })
  it('voids games with no posted result after three days', () => {
    const res = buildResults(games, Date.parse('2026-10-21T00:00:00Z'))
    expect(houseOutcome(win.id, res)).toBe('void')
  })
  it('stays pending while waiting for a result', () => {
    expect(houseOutcome(win.id, buildResults(games, later))).toBeNull()
    expect(houseOutcome('not-a-house-id', results)).toBeNull()
  })
})
