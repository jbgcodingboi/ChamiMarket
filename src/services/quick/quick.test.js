import { describe, expect, it } from 'vitest'
import { etInstant } from '../../utils/time.js'
import { aboveId, buildCoinMarkets, COINS, cryptoOutcome, hourlyEnd, parseCryptoId, probAbove, sigmaFromCandles, strikesFor, upDownId, upDownStarts } from './crypto.js'
import { espnOutcome, isEspnSettleable, parseScoreboard } from './espn.js'
import { buildParlays, parlayOutcome, parseParlayId } from './parlays.js'
import { buildStockMarkets, isTradingDay, nextSession, parseStockId, parseYahooChart, previousSession, stockOutcome } from './stocks.js'
import { buildWeatherMarkets, parseClimateReport, parseForecast, parseWeatherId, probHighAtLeast, STATIONS, weatherOutcome } from './weather.js'

const BTC = COINS[0]

describe('crypto', () => {
  const now = Date.parse('2026-10-16T19:07:30Z') // 3:07:30 PM ET
  it('lists the next two 15-minute windows and the hourly strikes', () => {
    expect(upDownStarts(now).map((t) => new Date(t).toISOString())).toEqual(['2026-10-16T19:15:00.000Z', '2026-10-16T19:30:00.000Z'])
    expect(new Date(hourlyEnd(now)).toISOString()).toBe('2026-10-16T20:00:00.000Z')
    expect(hourlyEnd(Date.parse('2026-10-16T19:50:00Z'))).toBeNull()
    expect(strikesFor(82190)).toEqual([82000, 82250])
    expect(strikesFor(4012)).toEqual([4010, 4020])
  })
  it('prices strikes from spot and volatility', () => {
    expect(probAbove(82200, 82000, 0.0008, 50)).toBeGreaterThan(0.5)
    expect(probAbove(82200, 82250, 0.0008, 50)).toBeLessThan(0.5)
    expect(probAbove(82200, 82000, 0.0008, 0)).toBe(1)
    const markets = buildCoinMarkets(BTC, { spot: 82200, sigma: 0.0008, hourOpen: 82190 }, now)
    expect(markets.map((m) => m.title)).toEqual([
      'Bitcoin up or down, 3:15 PM–3:30 PM ET?',
      'Bitcoin up or down, 3:30 PM–3:45 PM ET?',
      'Bitcoin above $82,000 at 4:00 PM ET?',
      'Bitcoin above $82,250 at 4:00 PM ET?',
    ])
    expect(markets[0].yesPrice).toBe(0.5)
    expect(markets[0].labels).toEqual({ yes: 'Up', no: 'Down' })
    expect(markets[2].endDate).toBe('2026-10-16T19:45:00.000Z')
  })
  it('measures per-minute volatility from candles', () => {
    const candles = Array.from({ length: 60 }, (_, i) => [1000 + i * 60, 0, 0, 0, 82000 * (1 + (i % 2 ? 0.0005 : -0.0005)), 1])
    expect(sigmaFromCandles(candles)).toBeGreaterThan(0.0005)
  })
  it('settles from one-minute candles', () => {
    const start = Date.parse('2026-10-16T19:15:00Z')
    const end = start + 15 * 60e3
    const candles = [
      [start / 1000, 0, 0, 82100, 82120, 1],
      [(end - 60e3) / 1000, 0, 0, 82150, 82180, 1],
    ]
    const up = parseCryptoId(upDownId('btc', start))
    expect(cryptoOutcome(up, candles, end + 120e3)).toBe('yes')
    expect(cryptoOutcome(up, candles, end - 1)).toBeNull()
    const above = parseCryptoId(aboveId('btc', 82250, end))
    expect(above).toMatchObject({ kind: 'above', strike: 82250 })
    expect(cryptoOutcome(above, candles, end + 120e3)).toBe('no')
  })
})

// Real Daily Climate Report excerpts for Central Park (Oct 14-15, 2026).
const PRELIM = `...THE CENTRAL PARK NY CLIMATE SUMMARY FOR OCTOBER 15 2026...
VALID TODAY AS OF 0400 PM LOCAL TIME.
TEMPERATURE (F)
 TODAY
  MAXIMUM         64    205 PM  84    1956  65     -1       68
  MINIMUM         54    654 AM  32    1876  52      2       52
PRECIPITATION (IN)
  TODAY            0.00          1.70 1943   0.15  -0.15     0.00
  MONTH TO DATE    2.01                      2.15  -0.14     1.92`
const FINAL = `...THE CENTRAL PARK NY CLIMATE SUMMARY FOR OCTOBER 14 2026...
TEMPERATURE (F)
 YESTERDAY
  MAXIMUM         77    259 PM  84    1920  65     12       61
  MINIMUM         64   1159 PM  37    1988  52     12       53
PRECIPITATION (IN)
  YESTERDAY        0.02          1.76 1995   0.14  -0.12     0.00`

describe('weather', () => {
  it('parses preliminary and final climate reports', () => {
    expect(parseClimateReport(PRELIM)).toEqual({ date: '2026-10-15', final: false, maxTemp: 64, precip: 0 })
    expect(parseClimateReport(FINAL)).toEqual({ date: '2026-10-14', final: true, maxTemp: 77, precip: 0.02 })
    expect(parseClimateReport(FINAL.replace('0.02', 'T')).precip).toBe(0)
    expect(parseClimateReport('nothing here')).toBeNull()
  })
  it('lists round lines near the forecast high and a precipitation market', () => {
    const forecast = { properties: { periods: [
      { startTime: '2026-10-16T06:00:00-04:00', isDaytime: true, temperature: 75, temperatureUnit: 'F', probabilityOfPrecipitation: { value: 60 } },
      { startTime: '2026-10-16T18:00:00-04:00', isDaytime: false, temperature: 49, temperatureUnit: 'F', probabilityOfPrecipitation: { value: 40 } },
    ] } }
    const now = Date.parse('2026-10-16T12:00:00Z') // 8 AM ET
    const markets = buildWeatherMarkets(STATIONS[0], parseForecast(forecast), now)
    const titles = markets.map((m) => m.title)
    expect(titles).toContain('Central Park high of 75°F or warmer today?')
    expect(titles).not.toContain('Central Park high of 70°F or warmer today?')
    expect(titles).not.toContain('Measurable rain or snow at Central Park today?') // closed at 7 AM
    const high = markets.find((m) => m.title.includes('75°F'))
    expect(high.yesPrice).toBeCloseTo(probHighAtLeast(75, 75, 2.5), 3)
    expect(high.endDate).toBe(new Date(etInstant('2026-10-16', '11:00')).toISOString())
    const early = buildWeatherMarkets(STATIONS[0], parseForecast(forecast), Date.parse('2026-10-16T09:00:00Z'))
    const rain = early.find((m) => m.title.startsWith('Measurable'))
    expect(rain.yesPrice).toBeCloseTo(1 - 0.4 * 0.8, 2)
  })
  it('settles highs early on a Yes and otherwise from the final report', () => {
    const reports = [parseClimateReport(PRELIM), parseClimateReport(FINAL)]
    const now = Date.parse('2026-10-16T12:00:00Z')
    expect(weatherOutcome(parseWeatherId('q-wx-nyc-high-20261015-60'), reports, now)).toBe('yes')
    expect(weatherOutcome(parseWeatherId('q-wx-nyc-high-20261015-65'), reports, now)).toBeNull()
    expect(weatherOutcome(parseWeatherId('q-wx-nyc-high-20261014-80'), reports, now)).toBe('no')
    expect(weatherOutcome(parseWeatherId('q-wx-nyc-precip-20261014'), reports, now)).toBe('yes')
    expect(weatherOutcome(parseWeatherId('q-wx-nyc-precip-20261015'), reports, now)).toBeNull()
    expect(weatherOutcome(parseWeatherId('q-wx-nyc-precip-20261001'), reports, now)).toBe('void')
  })
})

describe('stocks', () => {
  it('follows the NYSE calendar', () => {
    expect(isTradingDay('2026-10-16')).toBe(true)
    expect(isTradingDay('2026-10-17')).toBe(false)
    expect(isTradingDay('2026-11-26')).toBe(false)
    expect(previousSession('2026-10-19')).toBe('2026-10-16')
    expect(nextSession(Date.parse('2026-10-16T12:00:00Z'))).toBe('2026-10-16') // 8 AM ET
    expect(nextSession(Date.parse('2026-10-16T14:00:00Z'))).toBe('2026-10-19') // after the open, Friday
  })
  it('builds up/down markets and settles from closes', () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    const [spy] = buildStockMarkets(now, { SPY: [{ date: '2026-10-15', close: 771.79, final: true }] })
    expect(spy.title).toBe('Will the S&P 500 (SPY) close up on Fri, Oct 16?')
    expect(spy.eventTitle).toContain('previous close $771.79')
    expect(spy.yesPrice).toBe(0.53)
    const closes = { SPY: [{ date: '2026-10-15', close: 771.79, final: true }, { date: '2026-10-16', close: 775.1, final: true }] }
    expect(stockOutcome(parseStockId(spy.id), closes, now)).toBe('yes')
    expect(stockOutcome(parseStockId(spy.id), { SPY: [{ date: '2026-10-16', close: 775.1, final: false }] }, now)).toBeNull()
  })
  it('reads Yahoo daily bars and marks today final only after the close', () => {
    const chart = { chart: { result: [{ timestamp: [1792071000], indicators: { quote: [{ close: [771.7899780273438] }] } }] } }
    expect(parseYahooChart(chart, Date.parse('2026-10-15T19:00:00Z'))).toEqual([{ date: '2026-10-15', close: 771.79, final: false }])
    expect(parseYahooChart(chart, Date.parse('2026-10-15T21:00:00Z'))[0].final).toBe(true)
  })
})

describe('ESPN settlement', () => {
  const board = {
    events: [
      {
        date: '2026-10-16T00:15Z',
        status: { type: { state: 'post', completed: true } },
        competitions: [{ competitors: [
          { homeAway: 'home', score: '24', winner: true, team: { name: 'Broncos', shortDisplayName: 'Broncos', displayName: 'Denver Broncos', abbreviation: 'DEN', location: 'Denver' } },
          { homeAway: 'away', score: '20', winner: false, team: { name: 'Seahawks', shortDisplayName: 'Seahawks', displayName: 'Seattle Seahawks', abbreviation: 'SEA', location: 'Seattle' } },
        ] }],
      },
    ],
  }
  const market = { title: 'Seahawks vs. Broncos', league: 'nfl', labels: { yes: 'Seahawks', no: 'Broncos' } }
  it('settles a moneyline market once the game is final', () => {
    const games = parseScoreboard(board)
    expect(isEspnSettleable(market)).toBe(true)
    expect(espnOutcome(market, games)).toBe('no')
    expect(espnOutcome({ ...market, labels: { yes: 'Denver Broncos', no: 'Seattle Seahawks' } }, games)).toBe('yes')
  })
  it('ignores live games, other teams and non-moneyline markets', () => {
    const live = parseScoreboard({ events: [{ ...board.events[0], status: { type: { state: 'in', completed: false } } }] })
    expect(espnOutcome(market, live)).toBeNull()
    expect(espnOutcome({ ...market, labels: { yes: 'Jets', no: 'Broncos' } }, parseScoreboard(board))).toBeNull()
    expect(isEspnSettleable({ ...market, title: 'Spread: Broncos (-3.5)' })).toBe(false)
    expect(isEspnSettleable({ ...market, labels: { yes: 'Yes', no: 'No' } })).toBe(false)
  })
})

describe('parlays', () => {
  const now = Date.parse('2026-10-16T16:00:00Z')
  const game = (id, a, b, yes, volume, hours = 6) => ({
    id, title: `${a} vs. ${b}`, category: 'sports', league: 'nba', labels: { yes: a, no: b },
    yesPrice: yes, noPrice: Math.round((1 - yes) * 100) / 100, volume, endDate: new Date(now + hours * 3600e3).toISOString(),
  })
  const markets = [
    game('1', 'Knicks', 'Raptors', 0.7, 900),
    game('2', 'Thunder', 'Rockets', 0.35, 800), // Rockets favored at 65%
    game('3', 'Lakers', 'Warriors', 0.5, 700), // coin flip: no favorite
    game('4', 'Celtics', 'Nets', 0.9, 600), // too heavy a favorite
    game('5', 'Bulls', 'Heat', 0.6, 500),
    game('6', 'Suns', 'Jazz', 0.62, 400, 30), // more than 24h away
  ]
  it('combines same-day favorites and never builds long shots', () => {
    const parlays = buildParlays(markets, now)
    // Knicks and Rockets pair up; Bulls is left without a partner. Lakers (50/50), Celtics (90%) and Suns (30h away) never qualify.
    expect(parlays.map((p) => p.title)).toEqual(['Parlay: Knicks + Rockets'])
    expect(parlays[0].yesPrice).toBeCloseTo(0.7 * 0.65, 4)
    expect(parlays.every((p) => p.yesPrice >= 0.15)).toBe(true)
  })
  it('round-trips legs through the id and settles from them', () => {
    const [p] = buildParlays(markets, now)
    const legs = parseParlayId(p.id)
    expect(legs).toEqual([{ id: '1', side: 'yes' }, { id: '2', side: 'no' }])
    expect(parlayOutcome(legs, ['yes', null])).toBeNull()
    expect(parlayOutcome(legs, ['yes', 'yes'])).toBe('no')
    expect(parlayOutcome(legs, ['yes', 'no'])).toBe('yes')
    expect(parlayOutcome(legs, ['void', 'no'])).toBe('void')
  })
})
