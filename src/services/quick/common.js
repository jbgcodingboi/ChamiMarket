/** Shared shape for Quick markets: house-priced, short-lived, self-describing ids. */
import { roundPrice } from '../../utils/math.js'

export function quickMarket({ id, title, description, eventTitle, endDate, yesPrice, labels, avatar, createdAt, quote }) {
  const p = roundPrice(yesPrice)
  return {
    id,
    slug: id,
    title,
    description,
    eventTitle,
    category: 'quick',
    league: 'quick',
    avatar,
    tags: [],
    image: null,
    labels: labels ?? { yes: 'Yes', no: 'No' },
    yesPrice: p,
    noPrice: roundPrice(1 - p),
    tokenIds: null,
    volume: 0,
    volume24h: 0,
    liquidity: 0,
    endDate: new Date(endDate).toISOString(),
    createdAt: new Date(createdAt ?? endDate - 3600e3).toISOString(),
    active: true,
    closed: false,
    acceptingOrders: true,
    resolvedOutcome: null,
    source: 'house',
    // How the server prices it live at trade time (hourly crypto only).
    ...(quote && { quote }),
  }
}

export const isQuickId = (id) => typeof id === 'string' && id.startsWith('q-')
