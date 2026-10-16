/**
 * Daily parlays: two or three favorites from games starting in the next 24
 * hours, priced as the product of the legs' current prices (legs are treated
 * as independent). Only favorites between 55% and 85% are used and every
 * parlay must stay at 15% or better, so they are never long shots. Trading
 * closes when the first leg starts.
 *
 * Ids list the legs ("q-parlay-<marketId>_y~<marketId>_n"), so any parlay can
 * be priced and settled from its legs alone: a losing leg settles it No right
 * away, all winning legs settle it Yes, and a voided leg voids the parlay.
 */
import { roundPrice } from '../../utils/math.js'
import { quickMarket } from './common.js'

const HOUR = 3600e3
const LEG_MIN = 0.55
const LEG_MAX = 0.85
const MIN_PARLAY = 0.15
const GAME_LEAGUES = new Set(['nfl', 'cfb', 'nba', 'mlb', 'nhl'])

const sidePrice = (m, side) => (side === 'yes' ? m.yesPrice : m.noPrice)

/** When a leg's game starts: the kickoff time if known, else the market's close. */
const legStart = (m) => Date.parse(m.gameStart ?? m.endDate)

function legLabel(m, side) {
  if (m.category === 'chaminade') {
    const sport = m.title.split(':')[0]
    return side === 'yes' ? `Chaminade (${sport})` : `${m.title.match(/beat (.+)\?$/)?.[1] ?? 'Opponent'} (${sport})`
  }
  return m.labels[side]
}

/** Moneyline-style markets that make sensible parlay legs. */
function isLegCandidate(m) {
  if (m.category === 'chaminade') return m.id.endsWith('-win')
  return m.category === 'sports' && GAME_LEAGUES.has(m.league) && m.labels.yes !== 'Yes' && /\bvs\.?\b/i.test(m.title)
}

export const parlayId = (legs) => `q-parlay-${legs.map((l) => `${l.id}_${l.side === 'yes' ? 'y' : 'n'}`).join('~')}`

export function parseParlayId(id) {
  if (typeof id !== 'string' || !id.startsWith('q-parlay-')) return null
  const legs = id
    .slice('q-parlay-'.length)
    .split('~')
    .map((part) => {
      const i = part.lastIndexOf('_')
      return { id: part.slice(0, i), side: part.slice(i + 1) === 'y' ? 'yes' : 'no' }
    })
  return legs.length >= 2 && legs.every((l) => l.id) ? legs : null
}

/** Builds a parlay market from legs ({ market, side }). */
export function parlayMarket(legs) {
  const price = legs.reduce((p, l) => p * sidePrice(l.market, l.side), 1)
  const labels = legs.map((l) => legLabel(l.market, l.side))
  const close = Math.min(...legs.map((l) => legStart(l.market)))
  return quickMarket({
    id: parlayId(legs.map((l) => ({ id: l.market.id, side: l.side }))),
    title: `Parlay: ${labels.join(' + ')}`,
    eventTitle: `${legs.length}-leg daily parlay`,
    description: `Resolves Yes only if every leg wins: ${legs
      .map((l, i) => `(${i + 1}) ${l.market.title} – ${l.market.labels[l.side]}`)
      .join('; ')}. Settles No as soon as any leg loses. If any leg is voided, the parlay is voided and refunded at cost. Priced as the product of the legs' current prices. Trading closes when the first game starts.`,
    endDate: close,
    createdAt: close - 24 * HOUR,
    yesPrice: roundPrice(price),
    avatar: 'parlay',
  })
}

/** Up to three parlays from today's favorites, highest volume first. */
export function buildParlays(markets, now) {
  const legs = markets
    .filter((m) => isLegCandidate(m))
    .filter((m) => {
      const start = legStart(m)
      return start > now + 0.5 * HOUR && start < now + 24 * HOUR
    })
    .map((m) => {
      const side = m.yesPrice >= m.noPrice ? 'yes' : 'no'
      return { market: m, side, price: sidePrice(m, side) }
    })
    .filter((l) => l.price >= LEG_MIN && l.price <= LEG_MAX)
    .sort((a, b) => b.market.volume - a.market.volume || (a.market.id < b.market.id ? -1 : 1))

  const parlays = []
  let i = 0
  for (const size of [2, 3, 2]) {
    let group = legs.slice(i, i + size)
    if (group.length < 2) break
    if (group.reduce((p, l) => p * l.price, 1) < MIN_PARLAY) group = group.slice(0, 2)
    i += group.length
    if (group.reduce((p, l) => p * l.price, 1) >= MIN_PARLAY) parlays.push(parlayMarket(group))
  }
  return parlays
}

/**
 * Settles a parlay from its legs' outcomes ('yes' | 'no' | 'void' | null for
 * pending, given in the same order as the legs).
 */
export function parlayOutcome(legs, outcomes) {
  if (outcomes.some((o) => o === 'void')) return 'void'
  if (legs.some((l, i) => outcomes[i] && outcomes[i] !== l.side)) return 'no'
  return outcomes.every((o, i) => o === legs[i].side) ? 'yes' : null
}
