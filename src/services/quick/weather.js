/**
 * Local weather Quick markets for Central Park (NYC) and Mineola (Long Island),
 * from the National Weather Service API (browser-callable):
 *  - "High of X°F or warmer" on round 5°F lines near the forecast high
 *  - "Measurable rain or snow" when the chance is neither tiny nor near-certain
 * Settled from the official NWS Daily Climate Report (CLI). A Yes can settle
 * early from the 4 PM preliminary report (a high or rainfall already reached
 * can't be undone); everything else settles from the final report issued
 * overnight. Mineola has no climate station of its own, so its markets use
 * the Mineola forecast and settle from the closest official report, at JFK
 * Airport, with a wider error to cover the distance.
 */
import { clamp, normalCdf } from '../../utils/math.js'
import { addDays, compactDate, etDate, etDayLabel, etInstant } from '../../utils/time.js'
import { fetchJson } from '../http.js'
import { quickMarket } from './common.js'

/**
 * Listed stations. grid is the NWS forecast gridpoint, or point (lat,lon) to
 * look it up. report names where the official reading comes from when it
 * isn't the place itself; sigmaPad widens the forecast error to match.
 */
export const STATIONS = [
  { id: 'nyc', name: 'Central Park', place: 'Central Park, NYC', cli: 'NYC', grid: 'OKX/34,45' },
  {
    id: 'mnl',
    name: 'Mineola',
    place: 'Mineola, Long Island',
    cli: 'JFK',
    point: '40.7490,-73.6407',
    report: 'JFK Airport',
    reportNote: 'Mineola has no official climate station, so this market uses the closest one, at JFK Airport about 10 miles away.',
    sigmaPad: 1,
  },
]
/** No longer listed, but positions already open on them still settle. */
const RETIRED = [{ id: 'isp', name: 'Islip', place: 'Islip, Long Island (MacArthur Airport)', cli: 'ISP', grid: 'OKX/63,51' }]
const NWS = 'https://api.weather.gov'
const HIGH_CLOSE = '11:00'
const PRECIP_CLOSE = '07:00'
const SIGMA_BY_DAY = [2.5, 3.5]
const LINE_STEP = 5
const MIN_P = 0.12
const MAX_P = 0.88

/** Forecast periods as { start, date (ET), isDaytime, temp °F, pop 0-1 }. */
export function parseForecast(json) {
  const periods = json?.properties?.periods
  if (!Array.isArray(periods)) return []
  return periods
    .map((p) => {
      const start = Date.parse(p?.startTime)
      const temp = p?.temperatureUnit === 'C' ? (p.temperature * 9) / 5 + 32 : p?.temperature
      return {
        start,
        date: Number.isFinite(start) ? etDate(start) : null,
        isDaytime: p?.isDaytime === true,
        temp: Number.isFinite(temp) ? Math.round(temp) : null,
        pop: Number.isFinite(p?.probabilityOfPrecipitation?.value) ? p.probabilityOfPrecipitation.value / 100 : 0,
      }
    })
    .filter((p) => p.date && p.temp !== null)
}

/** Daytime high and day/night precipitation chances for a date, or null. */
export function dayForecast(periods, date) {
  const day = periods.find((p) => p.date === date && p.isDaytime)
  if (!day) return null
  const night = periods.find((p) => p.date === date && !p.isDaytime)
  return { high: day.temp, popDay: day.pop, popNight: night?.pop ?? 0 }
}

/** P(official high >= line) given a forecast high, rounding to whole degrees. */
export const probHighAtLeast = (forecast, line, sigma) => normalCdf((forecast + 0.5 - line) / sigma)

/** Chance of measurable precipitation over the calendar day; about half the night period falls before midnight. */
export const probPrecip = (popDay, popNight) => 1 - (1 - popDay) * (1 - popNight / 2)

export const highId = (station, date, line) => `q-wx-${station}-high-${compactDate(date)}-${line}`
export const precipId = (station, date) => `q-wx-${station}-precip-${compactDate(date)}`

/** Markets for one station from its forecast periods, for today and tomorrow (Eastern). */
export function buildWeatherMarkets(station, periods, now) {
  const markets = []
  const today = etDate(now)
  ;[today, addDays(today, 1)].forEach((date, dayIndex) => {
    const fc = dayForecast(periods, date)
    if (!fc) return
    const sigma = SIGMA_BY_DAY[dayIndex] + (station.sigmaPad ?? 0)
    const where = station.report ?? station.place
    const note = station.reportNote ? ` ${station.reportNote}` : ''
    const highClose = etInstant(date, HIGH_CLOSE)
    if (now < highClose) {
      const base = Math.round(fc.high / LINE_STEP) * LINE_STEP
      for (const line of [base - LINE_STEP, base, base + LINE_STEP]) {
        const p = probHighAtLeast(fc.high, line, sigma)
        if (p < MIN_P || p > MAX_P) continue
        markets.push(
          quickMarket({
            id: highId(station.id, date, line),
            title: `${station.name} hits ${line}°F ${dayIndex ? 'tomorrow' : 'today'}?`,
            eventTitle: `${station.place} · ${etDayLabel(date)} · forecast high ${fc.high}°F`,
            description: `Resolves Yes if the official maximum temperature for ${where} on ${etDayLabel(date)} is ${line}°F or higher, per the National Weather Service Daily Climate Report.${note} A Yes can settle as soon as the 4 PM report shows the high reached; otherwise the market settles from the final report issued overnight. Trading closes at 11:00 AM ET that day. Odds come from the NWS forecast high for ${station.place} with a typical error of about ${sigma}°F.`,
            endDate: highClose,
            createdAt: highClose - 2 * 864e5,
            yesPrice: p,
            avatar: 'weather',
          }),
        )
      }
    }
    const precipClose = etInstant(date, PRECIP_CLOSE)
    const pp = probPrecip(fc.popDay, fc.popNight)
    if (now < precipClose && pp >= 0.15 && pp <= 0.85) {
      markets.push(
        quickMarket({
          id: precipId(station.id, date),
          title: `Rain or snow at ${station.name} ${dayIndex ? 'tomorrow' : 'today'}?`,
          eventTitle: `${station.place} · ${etDayLabel(date)} · ${Math.round(fc.popDay * 100)}% chance in the daytime forecast`,
          description: `Resolves Yes if the National Weather Service Daily Climate Report for ${where} records at least 0.01 inches of precipitation (rain or melted snow) on ${etDayLabel(date)}. A trace does not count.${note} A Yes can settle from the 4 PM report; a No settles from the final report issued overnight. Trading closes at 7:00 AM ET that day. Odds come from the NWS chance of precipitation for ${station.place}.`,
          endDate: precipClose,
          createdAt: precipClose - 2 * 864e5,
          yesPrice: clamp(pp, 0.15, 0.85),
          avatar: 'rain',
        }),
      )
    }
  })
  return markets
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

/**
 * Parses a Daily Climate Report (CLI) product text. Preliminary reports
 * describe "TODAY" (valid as of late afternoon); final reports, issued after
 * midnight, describe "YESTERDAY".
 */
export function parseClimateReport(text) {
  if (typeof text !== 'string') return null
  const head = /CLIMATE SUMMARY FOR ([A-Z]+) (\d{1,2}) (\d{4})/.exec(text)
  if (!head) return null
  const month = MONTHS.indexOf(head[1]) + 1
  if (!month) return null
  const date = `${head[3]}-${String(month).padStart(2, '0')}-${head[2].padStart(2, '0')}`
  const tempSection = text.split('TEMPERATURE (F)')[1] ?? ''
  const final = /^\s*YESTERDAY\b/m.test(tempSection.split('PRECIPITATION')[0])
  const max = /^\s*MAXIMUM\s+(-?\d+|MM)/m.exec(tempSection)
  const precipSection = text.split('PRECIPITATION (IN)')[1] ?? ''
  const precip = /^\s*(?:TODAY|YESTERDAY)\s+(\d+\.\d+|T|MM)/m.exec(precipSection)
  const precipValue = !precip || precip[1] === 'MM' ? null : precip[1] === 'T' ? 0 : Number(precip[1])
  return {
    date,
    final,
    maxTemp: max && max[1] !== 'MM' ? Number(max[1]) : null,
    precip: precipValue,
  }
}

const WX_RE = /^q-wx-(nyc|mnl|isp)-(high|precip)-(\d{8})(?:-(\d+))?$/

export function parseWeatherId(id) {
  const m = WX_RE.exec(id)
  if (!m) return null
  const date = `${m[3].slice(0, 4)}-${m[3].slice(4, 6)}-${m[3].slice(6)}`
  return { station: [...STATIONS, ...RETIRED].find((s) => s.id === m[1]), kind: m[2], date, line: m[4] ? Number(m[4]) : null }
}

/** Outcome from the station's climate reports (any order), or null while pending. */
export function weatherOutcome(parsed, reports, now) {
  if (!parsed) return null
  const forDay = reports.filter((r) => r?.date === parsed.date)
  const final = forDay.find((r) => r.final)
  const prelim = forDay.find((r) => !r.final)
  if (parsed.kind === 'high') {
    if (final && final.maxTemp !== null) return final.maxTemp >= parsed.line ? 'yes' : 'no'
    if (prelim && prelim.maxTemp !== null && prelim.maxTemp >= parsed.line) return 'yes'
  } else {
    if (final && final.precip !== null) return final.precip > 0 ? 'yes' : 'no'
    if (prelim && prelim.precip !== null && prelim.precip > 0) return 'yes'
  }
  return now > etInstant(addDays(parsed.date, 4), '00:00') ? 'void' : null
}

/** The station's forecast URL: its fixed gridpoint, or the one NWS gives for its coordinates. */
async function forecastUrl(station) {
  if (station.grid) return `${NWS}/gridpoints/${station.grid}/forecast`
  const point = await fetchJson(`${NWS}/points/${station.point}`, { memoMs: 24 * 3600e3 })
  const url = point?.properties?.forecast
  if (typeof url !== 'string' || !url.startsWith(`${NWS}/gridpoints/`)) throw new Error(`No forecast for ${station.name}`)
  return url
}

export async function fetchForecast(station) {
  return parseForecast(await fetchJson(await forecastUrl(station), { memoMs: 600000 }))
}

/** The station's most recent climate reports (preliminary and final), parsed. */
export async function fetchClimateReports(station) {
  const list = await fetchJson(`${NWS}/products/types/CLI/locations/${station.cli}`, { memoMs: 600000 })
  const ids = (Array.isArray(list?.['@graph']) ? list['@graph'] : []).slice(0, 6).map((p) => p?.id).filter(Boolean)
  const products = await Promise.allSettled(ids.map((id) => fetchJson(`${NWS}/products/${id}`, { memoMs: 3600000 })))
  return products.map((r) => (r.status === 'fulfilled' ? parseClimateReport(r.value?.productText) : null)).filter(Boolean)
}
