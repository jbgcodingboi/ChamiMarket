import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarketStore } from '../store/marketStore.js'
import { fetchJson } from './http.js'
import { normalizeGammaMarket, normalizeOrderBook, normalizePriceHistory } from './normalize.js'

const rawMarket = (over = {}) => ({
  id: '516710',
  question: 'Will the Lakers make the 2027 NBA playoffs?',
  slug: 'lakers-playoffs-2027',
  description: 'Resolves Yes if...',
  outcomes: '["Yes", "No"]',
  outcomePrices: '["0.415", "0.585"]',
  clobTokenIds: '["71321045679252212594626385532706912750332728571942532289631379312455583992563", "52114319501245915516055106046884209969926127482827954674443846427813813222426"]',
  volume: '1234567.89',
  volumeNum: 1234567.89,
  liquidity: '50000.5',
  liquidityNum: 50000.5,
  volume24hr: 2000,
  endDate: '2027-04-12T12:00:00Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  image: 'https://example-cdn.test/lakers.png',
  active: true,
  closed: false,
  events: [{ title: 'NBA Playoffs 2027' }],
  ...over,
})

describe('Gamma market normalization', () => {
  it('parses JSON-encoded string fields and string numbers', () => {
    const m = normalizeGammaMarket(rawMarket(), 'sports')
    expect(m).toMatchObject({
      id: '516710',
      yesPrice: 0.415,
      noPrice: 0.585,
      volume: 1234567.89,
      liquidity: 50000.5,
      labels: { yes: 'Yes', no: 'No' },
      eventTitle: 'NBA Playoffs 2027',
      category: 'sports',
      resolvedOutcome: null,
    })
    expect(m.tokenIds).toHaveLength(2)
  })

  it('accepts already-decoded arrays and team outcome labels', () => {
    const m = normalizeGammaMarket(rawMarket({ outcomes: ['Lakers', 'Celtics'], outcomePrices: [0.5, 0.5] }), 'sports')
    expect(m.labels).toEqual({ yes: 'Lakers', no: 'Celtics' })
  })

  it('drops malformed markets instead of throwing', () => {
    expect(normalizeGammaMarket(rawMarket({ outcomes: 'not json' }), 'sports')).toBeNull()
    expect(normalizeGammaMarket(rawMarket({ outcomes: '["A","B","C"]', outcomePrices: '["0.2","0.3","0.5"]' }), 'sports')).toBeNull()
    expect(normalizeGammaMarket(rawMarket({ outcomePrices: '["1.4","0.2"]' }), 'sports')).toBeNull()
    expect(normalizeGammaMarket(rawMarket({ question: '' }), 'sports')).toBeNull()
    expect(normalizeGammaMarket(null, 'sports')).toBeNull()
    expect(normalizeGammaMarket(rawMarket({ clobTokenIds: '[1,2]' }), 'sports').tokenIds).toBeNull()
    expect(normalizeGammaMarket(rawMarket({ image: 'javascript:alert(1)' }), 'sports').image).toBeNull()
  })

  it('detects a clear winner on closed markets only', () => {
    expect(normalizeGammaMarket(rawMarket({ closed: true, outcomePrices: '["1","0"]' }), 'sports').resolvedOutcome).toBe('yes')
    expect(normalizeGammaMarket(rawMarket({ closed: true, outcomePrices: '["0.0005","0.9995"]' }), 'sports').resolvedOutcome).toBe('no')
    expect(normalizeGammaMarket(rawMarket({ closed: true, outcomePrices: '["0.6","0.4"]' }), 'sports').resolvedOutcome).toBeNull()
    expect(normalizeGammaMarket(rawMarket({ closed: false, outcomePrices: '["1","0"]' }), 'sports').resolvedOutcome).toBeNull()
  })
})

describe('CLOB normalization', () => {
  it('sorts the book best-first and filters bad levels', () => {
    const book = normalizeOrderBook({
      bids: [{ price: '0.40', size: '100' }, { price: '0.42', size: '50' }, { price: 'x', size: '1' }],
      asks: [{ price: '0.47', size: '10' }, { price: '0.45', size: '20' }, { price: '0.46', size: '0' }],
    })
    expect(book.bids.map((b) => b.price)).toEqual([0.42, 0.4])
    expect(book.asks.map((a) => a.price)).toEqual([0.45, 0.47])
    expect(normalizeOrderBook({ bids: [], asks: [] })).toBeNull()
  })

  it('converts price history timestamps from seconds', () => {
    const pts = normalizePriceHistory({ history: [{ t: 1760000000, p: 0.5 }, { t: 1760003600, p: '0.52' }] })
    expect(pts).toEqual([{ t: 1760000000000, p: 0.5 }, { t: 1760003600000, p: 0.52 }])
    expect(normalizePriceHistory({ error: 'bad' })).toBeNull()
  })
})

function jsonResponse(body, status = 200, headers = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: (k) => headers[k] ?? null } }
}

describe('live data flow', () => {
  let clock = Date.parse('2026-10-15T12:00:00Z')
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    clock += 60000
    vi.setSystemTime(clock)
    useMarketStore.setState({ status: 'loading', source: null, stale: false, markets: {}, order: [], known: {}, tagIds: null, lastUpdated: null, tick: 0 })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('discovers tag ids, loads both categories and goes live', async () => {
    const urls = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      urls.push(url)
      if (url.includes('/tags/slug/sports')) return jsonResponse({ id: '1', slug: 'sports' })
      if (url.includes('/tags/slug/politics')) return jsonResponse({ id: '2', slug: 'politics' })
      if (url.includes('/markets?') && url.includes('tag_id=1')) return jsonResponse([rawMarket(), rawMarket({ id: '9', liquidityNum: 10 })])
      if (url.includes('/markets?') && url.includes('tag_id=2'))
        return jsonResponse([rawMarket({ id: '77', question: 'Will Democrats win the House?' })])
      return jsonResponse({}, 404)
    }))
    await useMarketStore.getState().refresh()
    const s = useMarketStore.getState()
    expect(s.source).toBe('live')
    expect(s.tagIds).toEqual({ sports: '1', politics: '2' })
    expect(s.order).toEqual(['516710', '77'])
    expect(s.markets['77'].category).toBe('politics')
    expect(urls.some((u) => u.includes('tag_id=1') && u.includes('closed=false') && u.includes('active=true'))).toBe(true)
  })

  it('keeps live data (marked stale) when a later refresh fails', async () => {
    useMarketStore.setState({
      source: 'live',
      status: 'ready',
      tagIds: { sports: '1', politics: '2' },
      lastUpdated: Date.now(),
      markets: { a: { ...normalizeGammaMarket(rawMarket({ id: 'a' }), 'sports') } },
      order: ['a'],
    })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await useMarketStore.getState().refresh()
    const s = useMarketStore.getState()
    expect(s.source).toBe('live')
    expect(s.stale).toBe(true)
    expect(s.order).toEqual(['a'])
  })

  it('falls back to bundled demo data when nothing live is available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('<html>', 200)))
    await useMarketStore.getState().refresh()
    const s = useMarketStore.getState()
    expect(s.source).toBe('mock')
    const list = s.order.map((id) => s.markets[id])
    expect(list.filter((m) => m.category === 'sports').length).toBeGreaterThanOrEqual(12)
    expect(list.filter((m) => m.category === 'politics').length).toBeGreaterThanOrEqual(12)
    expect(new Set(list.map((m) => m.category))).toEqual(new Set(['sports', 'politics']))
  })

  it('dedupes concurrent identical requests and honours 429 cooldowns', async () => {
    const fetchMock = vi.fn(async (url) =>
      url.includes('limited') ? jsonResponse({}, 429, { 'retry-after': '30' }) : jsonResponse({ ok: true }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([fetchJson('https://dedupe.test/x'), fetchJson('https://dedupe.test/x')])
    expect(a).toEqual({ ok: true })
    expect(b).toBe(a)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await expect(fetchJson('https://ratelimit.test/limited')).rejects.toMatchObject({ status: 429 })
    await expect(fetchJson('https://ratelimit.test/other')).rejects.toMatchObject({ status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.setSystemTime(Date.now() + 31000)
    await expect(fetchJson('https://ratelimit.test/other')).resolves.toEqual({ ok: true })
  })
})
