/**
 * Chaminade High School (Mineola, NY) house markets.
 *
 * Built from the school's SIDEARM athletics calendar feed
 * (/services/responsive-calendar.ashx), which lists every team's games with
 * home/away, status (A upcoming, O over, P postponed, C canceled) and final
 * scores. Odds are set by Chami Market from this season's results: there is
 * no betting market for high school games.
 *
 * Pure functions only; the scheduled snapshot job does the fetching.
 */
import { clamp, normalCdf, roundPrice } from '../utils/math.js'
import { easternToUtc } from '../utils/time.js'

export { easternToUtc, normalCdf }

export const CHAMINADE_SITE = 'https://athletics.chaminade-hs.org'
export const CALENDAR_ENDPOINT = `${CHAMINADE_SITE}/services/responsive-calendar.ashx`

const DAY = 864e5
export const LISTING_WINDOW_DAYS = 14
export const SEASON_WINDOW_DAYS = 150
export const STALE_RESULT_DAYS = 3
export const MIN_PROB = 0.15
export const MAX_PROB = 0.85
const HOME_EDGE_SD = 0.12
const SHRINK_GAMES = 2

// Typical spread of the final margin (and of the game total) per sport.
const SPORT_MODELS = [
  { match: /football/, sd: 14, ties: false, unit: 'points', totals: true },
  { match: /soccer/, sd: 1.8, ties: true, unit: 'goals', totals: true },
  { match: /basketball/, sd: 11, ties: false, unit: 'points', totals: true },
  { match: /hockey/, sd: 2.2, ties: true, unit: 'goals', totals: true },
  { match: /lacrosse/, sd: 4.5, ties: false, unit: 'goals', totals: true },
  { match: /baseball/, sd: 3.8, ties: false, unit: 'runs', totals: true },
  { match: /rugby/, sd: 15, ties: false, unit: 'points', totals: false },
  { match: /wrestling/, sd: 18, ties: false, unit: 'points', totals: false },
  { match: /swim/, sd: 18, ties: false, unit: 'points', totals: false },
  { match: /volleyball/, sd: 1.5, ties: false, unit: 'sets', totals: false },
]
const DEFAULT_MODEL = { sd: 5, ties: false, unit: 'points', totals: false }

/** Multi-team meets and regattas, which have no single opponent to beat. */
const NON_HEAD_TO_HEAD =
  /(invitational|championships?|regatta|relays|time trial|meet\b|classic|carnival|tournament|duals|open race|federation|regionals|scrimmage|jamboree|showcase)/i

export const modelFor = (sport) => SPORT_MODELS.find((m) => m.match.test(sport.toLowerCase())) ?? DEFAULT_MODEL


const num = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Flattens the calendar feed (an array of days, each with events) into
 * validated, de-duplicated games.
 */
export function parseCalendar(days) {
  const seen = new Set()
  const games = []
  for (const day of Array.isArray(days) ? days : []) {
    for (const e of Array.isArray(day?.events) ? day.events : []) {
      if (!e || seen.has(e.id) || typeof e.date !== 'string') continue
      seen.add(e.id)
      const sport = typeof e.sport?.title === 'string' ? e.sport.title.trim() : ''
      const opponent = typeof e.opponent?.title === 'string' ? e.opponent.title.trim().replace(/\s+/g, ' ') : ''
      if (!sport || !opponent) continue
      const start = easternToUtc(e.date)
      if (!Number.isFinite(start)) continue
      const r = e.result ?? {}
      const result = r.status === 'W' || r.status === 'L' || r.status === 'T' ? r.status : null
      games.push({
        id: String(e.id),
        start,
        localDate: e.date,
        time: typeof e.time === 'string' ? e.time : '',
        sport,
        opponent,
        home: e.location_indicator === 'H' ? 'home' : e.location_indicator === 'A' ? 'away' : 'neutral',
        location: typeof e.location === 'string' ? e.location : '',
        status: typeof e.status === 'string' ? e.status : '',
        result,
        teamScore: result ? num(r.team_score) : null,
        oppScore: result ? num(r.opponent_score) : null,
      })
    }
  }
  return games.sort((a, b) => a.start - b.start)
}

export const isHeadToHead = (g) => !NON_HEAD_TO_HEAD.test(g.opponent)

const sameOpponent = (a, b) => {
  const key = (s) => s.toLowerCase().replace(/\b(jv[ab]?|varsity|freshmen?)\b/g, '').replace(/[^a-z]/g, '').replace(/^st/, 'saint')
  return key(a) === key(b)
}

const scored = (g) => g.result && g.teamScore !== null && g.oppScore !== null

function seasonGames(games, game) {
  return games.filter(
    (g) => g.sport === game.sport && scored(g) && g.start < game.start && game.start - g.start < SEASON_WINDOW_DAYS * DAY,
  )
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const sampleSd = (xs) => {
  if (xs.length < 2) return null
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

/**
 * Win probability for an upcoming game: expected margin from this season's
 * results at that sport and level (shrunk toward even), blended with any
 * earlier meeting with the same opponent, plus home field. Clamped to
 * 15%-85% so markets are neither long shots nor near-locks.
 */
export function winModel(games, game) {
  const model = modelFor(game.sport)
  const prior = seasonGames(games, game)
  const margins = prior.map((g) => g.teamScore - g.oppScore)
  const observedSd = sampleSd(margins)
  const sd = margins.length >= 4 && observedSd ? clamp(observedSd, model.sd * 0.6, model.sd * 1.6) : model.sd
  const rating = margins.reduce((a, b) => a + b, 0) / (margins.length + SHRINK_GAMES)
  const h2h = prior.filter((g) => sameOpponent(g.opponent, game.opponent)).map((g) => g.teamScore - g.oppScore)
  const expected =
    (h2h.length ? 0.65 * rating + 0.35 * mean(h2h) : rating) +
    (game.home === 'home' ? HOME_EDGE_SD * sd : game.home === 'away' ? -HOME_EDGE_SD * sd : 0)
  const raw = model.ties ? normalCdf((expected - 0.5) / sd) : normalCdf(expected / sd)
  return { probability: roundPrice(clamp(raw, MIN_PROB, MAX_PROB)), expected, sd, games: margins.length, h2h: h2h.length }
}

/** Over/under line near this season's average total, or null without enough games. */
export function totalModel(games, game) {
  const model = modelFor(game.sport)
  if (!model.totals) return null
  const totals = seasonGames(games, game).map((g) => g.teamScore + g.oppScore)
  if (totals.length < 3) return null
  const avg = mean(totals)
  const line = Math.floor(avg) + 0.5
  const sd = Math.max(sampleSd(totals) ?? model.sd, model.sd * 0.5)
  return { line, probability: roundPrice(clamp(1 - normalCdf((line - avg) / sd), MIN_PROB, MAX_PROB)), unit: model.unit }
}

// Ids carry the game (and, for over/unders, the line) so results can be applied
// without remembering what was listed. A rescheduled game gets a new date key.
const gameKey = (g) => `cham-${g.id}-${g.localDate.slice(0, 10).replace(/-/g, '')}`
export const winMarketId = (g) => `${gameKey(g)}-win`
export const totalMarketId = (g, line) => `${gameKey(g)}-ou-${line}`

const vsText = (g) => (g.home === 'away' ? `at ${g.opponent}` : `vs. ${g.opponent}`)

/** "Varsity Football" -> "Football"; other levels keep their prefix ("JV Soccer"). */
const shortSport = (sport) => sport.replace(/^varsity\s+/i, '')

function whenText(g) {
  const d = new Date(g.start)
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(d)
  return g.time && !/tba|tbd/i.test(g.time) ? `${day}, ${g.time}` : day
}

const SOURCE = 'per the final score posted on athletics.chaminade-hs.org'
const VOID_RULE =
  'If the game is canceled or postponed, or no result is posted within 3 days, the market is voided and positions are refunded at cost.'

function baseMarket(g, id, title, probability, description) {
  return {
    id,
    slug: id,
    title,
    description,
    eventTitle: `${g.sport} · ${vsText(g)} · ${whenText(g)}`,
    category: 'chaminade',
    league: 'chaminade',
    tags: [],
    image: null,
    labels: { yes: 'Yes', no: 'No' },
    yesPrice: probability,
    noPrice: roundPrice(1 - probability),
    tokenIds: null,
    volume: 0,
    volume24h: 0,
    liquidity: 0,
    endDate: new Date(g.start).toISOString(),
    createdAt: new Date(g.start - LISTING_WINDOW_DAYS * DAY).toISOString(),
    active: true,
    closed: false,
    acceptingOrders: true,
    resolvedOutcome: null,
    source: 'house',
  }
}

/** Markets for head-to-head games starting within the listing window. */
export function buildMarkets(games, now = Date.now()) {
  const markets = []
  for (const g of games) {
    if (!isHeadToHead(g) || g.status !== 'A') continue
    if (g.start <= now - STALE_RESULT_DAYS * DAY || g.start > now + LISTING_WINDOW_DAYS * DAY) continue
    const win = winModel(games, g)
    const model = modelFor(g.sport)
    const basis = win.games
      ? `Odds are set by Chami Market from Chaminade's ${win.games} ${g.sport.toLowerCase()} result${win.games === 1 ? '' : 's'} this season${win.h2h ? ', including the earlier meeting with this opponent' : ''}, adjusted for ${g.home === 'neutral' ? 'a neutral site' : 'home field'}.`
      : `No ${g.sport.toLowerCase()} results yet this season, so odds start near even, adjusted for ${g.home === 'neutral' ? 'a neutral site' : 'home field'}.`
    markets.push(
      baseMarket(
        g,
        winMarketId(g),
        `${shortSport(g.sport)}: Will Chaminade beat ${g.opponent}?`,
        win.probability,
        `Resolves Yes if Chaminade wins this ${g.sport} game ${vsText(g)}, ${SOURCE}.${model.ties ? ' A tie resolves No.' : ''} ${VOID_RULE} ${basis}`,
      ),
    )
    const total = totalModel(games, g)
    if (total) {
      markets.push(
        baseMarket(
          g,
          totalMarketId(g, total.line),
          `${shortSport(g.sport)} ${vsText(g)}: over ${total.line} ${total.unit}?`,
          total.probability,
          `Resolves Yes if both teams combine for more than ${total.line} ${total.unit} in this ${g.sport} game, ${SOURCE}. ${VOID_RULE} The line sits near the average total of Chaminade's ${g.sport.toLowerCase()} games this season.`,
        ),
      )
    }
  }
  return markets
}

/**
 * Facts about recent games, keyed by game: the result (W/L/T, or void for
 * canceled/postponed games and games with no result after 3 days) and the
 * combined score. Markets are settled from these with houseOutcome().
 */
export function buildResults(games, now = Date.now()) {
  const out = {}
  for (const g of games) {
    if (!isHeadToHead(g) || g.start > now || now - g.start > 30 * DAY) continue
    if (g.status === 'C' || g.status === 'P') out[gameKey(g)] = { outcome: 'void', total: null }
    else if (g.result) out[gameKey(g)] = { outcome: g.result, total: scored(g) ? g.teamScore + g.oppScore : null }
    else if (now - g.start > STALE_RESULT_DAYS * DAY) out[gameKey(g)] = { outcome: 'void', total: null }
  }
  return out
}

const ID_RE = /^(cham-\d+-\d{8})-(win|ou-(\d+(?:\.\d+)?))$/

/** The settlement outcome ('yes' | 'no' | 'void') for a house market id, or null if pending. */
export function houseOutcome(marketId, results) {
  const m = ID_RE.exec(marketId)
  const fact = m ? results[m[1]] : null
  if (!fact) return null
  if (fact.outcome === 'void') return 'void'
  if (m[2] === 'win') return fact.outcome === 'W' ? 'yes' : 'no'
  if (fact.total === null) return 'void'
  return fact.total > Number(m[3]) ? 'yes' : 'no'
}

export const isHouseId = (id) => typeof id === 'string' && id.startsWith('cham-')

/** Months (first-of-month M/1/YYYY strings) to request from the calendar feed. */
export function calendarMonths(now = Date.now()) {
  const months = []
  const start = new Date(now - SEASON_WINDOW_DAYS * DAY)
  const end = new Date(now + LISTING_WINDOW_DAYS * DAY)
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  while (cur <= end) {
    months.push(`${cur.getUTCMonth() + 1}/1/${cur.getUTCFullYear()}`)
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return months
}
