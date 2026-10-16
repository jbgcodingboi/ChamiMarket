const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const sharesFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

const sharesShortFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export const formatCurrency = (v) => usd.format(safe(v) === 0 ? 0 : safe(v))

/** Currency with an explicit sign, e.g. +$12.40 or -$3.10. */
export function formatSignedCurrency(v) {
  const n = safe(v)
  if (Math.abs(n) < 0.005) return usd.format(0)
  return `${n > 0 ? '+' : '-'}${usd.format(Math.abs(n))}`
}

export const formatCompactCurrency = (v) => compactUsd.format(safe(v))

export const formatShares = (v) => sharesFmt.format(safe(v))
export const formatSharesShort = (v) => sharesShortFmt.format(safe(v))

/** Price in dollars (0 to 1) displayed as cents, e.g. 0.623 -> "62.3¢". */
export function formatCents(price) {
  const c = safe(price) * 100
  if (c > 0 && c < 1) return '<1¢'
  if (c < 100 && c > 99) return '>99¢'
  const rounded = Math.round(c * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}¢`
}

/** Price as a dollar amount with up to 4 decimals, e.g. $0.6230. */
export const formatPrice = (price) => `$${safe(price).toFixed(price >= 0.1 ? 2 : 4)}`

/** Probability (0 to 1) as a whole percentage, with clear extremes. */
export function formatProbability(price) {
  const p = safe(price) * 100
  if (p > 0 && p < 1) return '<1%'
  if (p > 99 && p < 100) return '>99%'
  return `${Math.round(p)}%`
}

export function formatPercent(v, { signed = false, decimals = 2 } = {}) {
  const rounded = Number(safe(v).toFixed(decimals))
  const text = `${Math.abs(rounded).toFixed(decimals)}%`
  if (rounded === 0) return text
  if (rounded < 0) return `-${text}`
  return signed ? `+${text}` : text
}

export function formatRelativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts)
  const s = Math.floor(diff / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatDate(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 'TBD' : dateFmt.format(d)
}

export function formatDateTime(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : dateTimeFmt.format(d)
}

export function pnlTone(v) {
  const n = safe(v)
  if (n > 0.004) return 'text-yes'
  if (n < -0.004) return 'text-no'
  return 'text-muted'
}

/** Countdown text for a market close, e.g. "Closes in 2h 05m". */
export function closesInText(ms) {
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'Closing now'
  if (m < 60) return `Closes in ${m}m`
  const h = Math.floor(m / 60)
  return `Closes in ${h}h ${String(m % 60).padStart(2, '0')}m`
}
