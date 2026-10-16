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
    useMarketStore.setState({ status: 'loading', source: null, stale: false, markets: {}, order: [], known: {}, tagIds: null, lastUpdated: null, snapshotResolutions: {}, tick: 0 })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const event = (id, title, markets, tags = []) => ({ id, title, endDate: '2026-12-01T00:00:00Z', tags, markets })

  it('discovers tags and leagues, curates the feeds and goes live', async () => {
    const urls = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      urls.push(url)
      const u = new URL(url)
      if (u.pathname === '/tags/slug/sports') return jsonResponse({ id: '1', slug: 'sports' })
      if (u.pathname === '/tags/slug/politics') return jsonResponse({ id: '2', slug: 'politics' })
      if (u.pathname === '/sports')
        return jsonResponse([
          { sport: 'nfl', series: '10187', tags: '1,450,100639' },
          { sport: 'epl', series: '10188', tags: '1,82,306,100639,100350' },
          { sport: 'mls', series: '10189', tags: '1,100350' },
        ])
      if (u.pathname === '/events' && u.searchParams.get('series_id') === '10187')
        return jsonResponse([
          event('e1', 'Chiefs vs. Bills', [
            rawMarket({ id: '11', question: 'Chiefs vs. Bills', outcomes: '["Chiefs","Bills"]', volumeNum: 900 }),
            rawMarket({ id: '12', question: 'Spread: Chiefs (-2.5)', volumeNum: 500 }),
            rawMarket({ id: '13', question: 'O/U 47.5', volumeNum: 400 }),
            rawMarket({ id: '14', question: 'Mahomes 300+ yards', volumeNum: 100 }),
          ]),
        ])
      if (u.pathname === '/events' && u.searchParams.get('series_id') === '10188')
        return jsonResponse([event('e2', 'Arsenal vs. Chelsea', [rawMarket({ id: '21', question: 'Arsenal vs. Chelsea' })])])
      if (u.pathname === '/events' && u.searchParams.get('tag_id') === '1' && u.searchParams.get('offset') === '0')
        return jsonResponse([
          event('e3', 'Inter Miami vs. LA Galaxy', [rawMarket({ id: '31', question: 'Inter Miami vs. LA Galaxy' })], [{ slug: 'soccer', label: 'Soccer' }, { slug: 'mls', label: 'MLS' }]),
          event('e4', 'NBA Finals', [rawMarket({ id: '41', question: 'Will the Thunder win the 2027 NBA Finals?', endDate: '2027-06-20T00:00:00Z' })]),
          event('e5', 'Long shot', [rawMarket({ id: '51', question: 'Will the Jets win Super Bowl LXI?', outcomePrices: '["0.01","0.99"]' })]),
          event('e6', 'Worlds', [rawMarket({ id: '61', question: 'LoL: T1 vs. Gen.G (BO5)' })], [{ slug: 'esports', label: 'Esports' }]),
          event('e7', 'Long shot game', [rawMarket({ id: '71', question: 'Will the Jets go 17-0?', outcomePrices: '["0.01","0.99"]' })]),
          event('e1', 'Chiefs vs. Bills', [rawMarket({ id: '11', question: 'Chiefs vs. Bills', outcomes: '["Chiefs","Bills"]', volumeNum: 900 })]),
        ])
      if (u.pathname === '/events' && u.searchParams.get('tag_id') === '2')
        return jsonResponse([
          event('p1', 'House control', [rawMarket({ id: '77', question: 'Will Democrats win the House?' })]),
          event('p2', 'Elon tweets', [rawMarket({ id: '78', question: 'Elon Musk # of tweets Oct 17-24?' })]),
          event('p3', 'Brazil', [rawMarket({ id: '79', question: 'Brazil presidential election: Lula?' })]),
        ])
      if (u.pathname === '/events') return jsonResponse([])
      return jsonResponse({}, 404)
    }))
    await useMarketStore.getState().refresh()
    const s = useMarketStore.getState()
    expect(s.source).toBe('live')
    expect(s.tagIds).toEqual({ sports: '1', politics: '2' })
    // 14: 4th market of one event; 31: MLS; 41: ends after June 1 2027; 61: esports; 71: 1% odds;
    // 78: tweets; 79: Brazil. 51 is a 1% championship future, which is exempt from the odds rule.
    expect([...s.order].sort()).toEqual(['11', '12', '13', '21', '51', '77'])
    expect(s.markets['11'].league).toBe('nfl')
    expect(s.markets['11'].labels).toEqual({ yes: 'Chiefs', no: 'Bills' })
    expect(s.markets['21'].league).toBe('epl')
    expect(urls.some((x) => x.includes('series_id=10189'))).toBe(false)
    const eventsCall = urls.find((x) => x.includes('/events?') && x.includes('tag_id=2'))
    expect(eventsCall).toContain('closed=false')
    expect(eventsCall).toContain('end_date_max=2027-06-02')
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

describe('snapshot parsing', () => {
  it('accepts a valid snapshot and drops bad resolutions', async () => {
    const { parseSnapshot } = await import('./snapshot.js')
    const snap = parseSnapshot({ generatedAt: 5, markets: [], resolutions: { a: 'yes', b: 'maybe', c: 'no' } })
    expect(snap).toEqual({ generatedAt: 5, markets: [], resolutions: { a: 'yes', c: 'no' } })
    expect(parseSnapshot({ markets: [] })).toBeNull()
    expect(parseSnapshot('<html>')).toBeNull()
  })
})
