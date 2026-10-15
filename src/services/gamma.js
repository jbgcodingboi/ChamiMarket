import { CATEGORIES, GAMMA_BASE, MARKETS_PER_CATEGORY, MIN_LIQUIDITY } from '../config.js'
import { fetchJson, HttpError } from './http.js'
import { isListable, normalizeGammaMarket, toNumber } from './normalize.js'

const tagIdFrom = (tag) => {
  const id = toNumber(tag?.id)
  return id !== null && Number.isInteger(id) ? String(id) : null
}

/**
 * Looks up the Gamma tag id for each visible category at startup, first via
 * /tags/slug/:slug and then by scanning the tag list, so ids are discovered
 * rather than hardcoded.
 */
export async function discoverTagIds() {
  const result = {}
  await Promise.all(
    CATEGORIES.map(async (cat) => {
      try {
        const tag = await fetchJson(`${GAMMA_BASE}/tags/slug/${cat.tagSlug}`)
        const id = tagIdFrom(tag)
        if (id) result[cat.id] = id
      } catch {
        // Try the list endpoint below.
      }
    }),
  )
  const missing = CATEGORIES.filter((c) => !result[c.id])
  if (missing.length) {
    const tags = await fetchJson(`${GAMMA_BASE}/tags?limit=1000`)
    if (!Array.isArray(tags)) throw new HttpError('Malformed tag list')
    for (const cat of missing) {
      const match = tags.find(
        (t) => typeof t?.slug === 'string' && t.slug.toLowerCase() === cat.tagSlug,
      )
      const id = tagIdFrom(match)
      if (id) result[cat.id] = id
    }
  }
  if (!CATEGORIES.every((c) => result[c.id])) throw new HttpError('Could not discover category tags')
  return result
}

function listFromMarkets(rows, category) {
  if (!Array.isArray(rows)) throw new HttpError('Malformed markets response')
  return rows
    .map((row) => normalizeGammaMarket(row, category))
    .filter((m) => m && isListable(m, MIN_LIQUIDITY))
}

async function fetchViaMarkets(category, tagId) {
  const params = new URLSearchParams({
    tag_id: tagId,
    active: 'true',
    closed: 'false',
    archived: 'false',
    limit: String(MARKETS_PER_CATEGORY),
    order: 'volume24hr',
    ascending: 'false',
    liquidity_num_min: String(MIN_LIQUIDITY),
  })
  return listFromMarkets(await fetchJson(`${GAMMA_BASE}/markets?${params}`), category)
}

async function fetchViaEvents(category, tagId) {
  const params = new URLSearchParams({
    tag_id: tagId,
    active: 'true',
    closed: 'false',
    archived: 'false',
    limit: '30',
    order: 'volume24hr',
    ascending: 'false',
  })
  const events = await fetchJson(`${GAMMA_BASE}/events?${params}`)
  if (!Array.isArray(events)) throw new HttpError('Malformed events response')
  const rows = events.flatMap((ev) =>
    Array.isArray(ev?.markets)
      ? ev.markets.map((m) => ({ ...m, events: [{ title: ev.title, image: ev.image }] }))
      : [],
  )
  return listFromMarkets(rows, category).slice(0, MARKETS_PER_CATEGORY)
}

/** Active, open, liquid binary markets for one category, most traded first. */
export async function fetchCategoryMarkets(category, tagId) {
  try {
    const list = await fetchViaMarkets(category, tagId)
    if (list.length) return list
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) throw err
  }
  return fetchViaEvents(category, tagId)
}

/** Single market lookup, used to refresh held markets and detect resolutions. */
export async function fetchMarketById(id, category) {
  if (!/^\d+$/.test(id)) return null
  const raw = await fetchJson(`${GAMMA_BASE}/markets/${id}`)
  return normalizeGammaMarket(raw, category)
}
