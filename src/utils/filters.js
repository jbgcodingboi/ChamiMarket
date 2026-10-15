/** Case-insensitive match on title, event title and description, within a category. */
export function filterMarkets(markets, { query = '', category = 'all' } = {}) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return markets.filter((m) => {
    if (category !== 'all' && m.category !== category) return false
    if (!terms.length) return true
    const haystack = `${m.title} ${m.eventTitle} ${m.description}`.toLowerCase()
    return terms.every((t) => haystack.includes(t))
  })
}

const time = (v, fallback) => {
  const t = v ? Date.parse(v) : NaN
  return Number.isNaN(t) ? fallback : t
}

export const SORTS = [
  { id: 'volume', label: 'Volume' },
  { id: 'newest', label: 'Newest' },
  { id: 'ending', label: 'Ending soon' },
]

/** Sorts a copy of the list; resolved markets always go last. */
export function sortMarkets(markets, sort, isResolved = () => false) {
  const list = [...markets]
  const cmp = {
    volume: (a, b) => b.volume - a.volume,
    newest: (a, b) => time(b.createdAt, 0) - time(a.createdAt, 0),
    ending: (a, b) => time(a.endDate, Infinity) - time(b.endDate, Infinity),
  }[sort] ?? ((a, b) => b.volume - a.volume)
  return list.sort((a, b) => Number(isResolved(a.id)) - Number(isResolved(b.id)) || cmp(a, b))
}
