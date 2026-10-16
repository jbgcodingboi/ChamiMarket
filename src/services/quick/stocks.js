/**
 * Daily stock Quick markets: "Will SPY / QQQ close up?" for the next NYSE
 * session, priced at the long-run share of up days (about 53%). Trading
 * closes at the 9:30 AM ET open. Settled from official daily closes, which
 * the scheduled snapshot job fetches server-side (the quote source doesn't
 * allow browser requests) and ships as data/quick.json.
 */
import { addDays, compactDate, etDate, etDayLabel, etInstant, weekday } from '../../utils/time.js'
import { quickMarket } from './common.js'

export const STOCKS = [
  { id: 'spy', symbol: 'SPY', name: 'S&P 500 (SPY)' },
  { id: 'qqq', symbol: 'QQQ', name: 'Nasdaq-100 (QQQ)' },
]
export const UP_DAY_RATE = 0.53

// NYSE full-day closures.
const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23',
  '2028-12-25',
])

export const isTradingDay = (date) => weekday(date) !== 0 && weekday(date) !== 6 && !HOLIDAYS.has(date)

export function previousSession(date) {
  let d = addDays(date, -1)
  while (!isTradingDay(d)) d = addDays(d, -1)
  return d
}

/** The next session whose 9:30 AM ET open is still ahead. */
export function nextSession(now) {
  let d = etDate(now)
  while (!isTradingDay(d) || now >= etInstant(d, '09:30')) d = addDays(d, 1)
  return d
}

export const stockId = (stock, date) => `q-stk-${stock}-${compactDate(date)}`

const usd = (v) => `$${v.toFixed(2)}`

/** closes: { SPY: [{ date, close, final }] } (may be empty). */
export function buildStockMarkets(now, closes = {}) {
  const date = nextSession(now)
  const prev = previousSession(date)
  return STOCKS.map((s) => {
    const prevClose = (closes[s.symbol] ?? []).find((c) => c.date === prev && c.final)?.close
    return quickMarket({
      id: stockId(s.id, date),
      title: `${s.name} up on ${etDayLabel(date)}?`,
      eventTitle: `${s.name} · ${etDayLabel(date)} session${prevClose ? ` · previous close ${usd(prevClose)}` : ''}`,
      description: `Resolves Yes if ${s.symbol}'s official closing price on ${etDayLabel(date)} is higher than its close on ${etDayLabel(prev)}${prevClose ? ` (${usd(prevClose)})` : ''}. An unchanged close resolves No. Trading closes at the 9:30 AM ET open; the market settles shortly after the 4:00 PM close. Priced at the long-run share of up days for U.S. stocks, about 53%. If the market doesn't open that day, the market is voided.`,
      endDate: etInstant(date, '09:30'),
      createdAt: etInstant(prev, '16:00'),
      yesPrice: UP_DAY_RATE,
      avatar: 'stocks',
    })
  })
}

const STK_RE = /^q-stk-(spy|qqq)-(\d{8})$/

export function parseStockId(id) {
  const m = STK_RE.exec(id)
  if (!m) return null
  const date = `${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6)}`
  return { stock: STOCKS.find((s) => s.id === m[1]), date }
}

export function stockOutcome(parsed, closes, now) {
  if (!parsed) return null
  const rows = closes?.[parsed.stock.symbol] ?? []
  const day = rows.find((r) => r.date === parsed.date && r.final)
  const prev = rows.find((r) => r.date === previousSession(parsed.date) && r.final)
  if (day && prev) return day.close > prev.close ? 'yes' : 'no'
  return now > etInstant(addDays(parsed.date, 4), '00:00') ? 'void' : null
}

/** Daily closes from a Yahoo Finance chart response (server-side only). */
export function parseYahooChart(json, now) {
  const r = json?.chart?.result?.[0]
  const ts = r?.timestamp
  const close = r?.indicators?.quote?.[0]?.close
  if (!Array.isArray(ts) || !Array.isArray(close)) return []
  const today = etDate(now)
  const closedToday = now >= etInstant(today, '16:15')
  return ts
    .map((t, i) => ({ date: etDate(t * 1000), close: close[i] }))
    .filter((row) => Number.isFinite(row.close))
    .map((row) => ({ ...row, close: Math.round(row.close * 100) / 100, final: row.date < today || (row.date === today && closedToday) }))
}
