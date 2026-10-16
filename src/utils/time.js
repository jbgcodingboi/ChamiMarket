/** America/New_York helpers. Markets close and settle on Eastern time. */
const ET = 'America/New_York'
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' })

/** Eastern calendar date of an instant, as YYYY-MM-DD. */
export const etDate = (ms) => dateFmt.format(new Date(ms))

/** "3:15 PM" in Eastern time. */
export const etTime = (ms) => timeFmt.format(new Date(ms))

/** "Fri, Oct 16" for a YYYY-MM-DD date. */
export const etDayLabel = (date) => dayFmt.format(new Date(`${date}T12:00:00Z`))

export const compactDate = (date) => date.replace(/-/g, '')

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Day of week (0 Sunday) for a YYYY-MM-DD date. */
export const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay()

function offsetMinutes(ms) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: ET, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName').value
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(name)
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : 0
}

/** Converts a naive Eastern wall-clock time ("2026-10-16T19:00:00") to UTC ms, DST-aware. */
export function easternToUtc(local) {
  const [d, t = '00:00:00'] = local.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi, s] = t.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, da, h, mi, s || 0)
  const first = guess - offsetMinutes(guess) * 60000
  return guess - offsetMinutes(first) * 60000
}

/** UTC ms for an Eastern date (YYYY-MM-DD) and wall-clock time (HH:MM). */
export const etInstant = (date, hhmm) => easternToUtc(`${date}T${hhmm}:00`)
