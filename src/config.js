export const APP_NAME = 'RedBook Markets'

export const STARTING_CASH = 100000
export const RESET_CASH = 50000

export const GAMMA_BASE = 'https://gamma-api.polymarket.com'
export const CLOB_BASE = 'https://clob.polymarket.com'

export const POLL_INTERVAL_MS = 20000
export const ORDER_BOOK_POLL_MS = 20000
export const REQUEST_TIMEOUT_MS = 7000
export const MIN_LIQUIDITY = 1000
export const MARKETS_PER_CATEGORY = 60
export const MAX_HELD_MARKET_REFRESH = 8

export const CATEGORIES = [
  { id: 'sports', label: 'Sports', tagSlug: 'sports' },
  { id: 'politics', label: 'Top Politics', tagSlug: 'politics' },
]

export const MIN_ORDER = 0.01
export const MAX_FEED_ENTRIES = 300
export const MAX_HISTORY_ENTRIES = 1000
export const MAX_SNAPSHOTS = 400
export const MAX_KNOWN_MARKETS = 400
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000
