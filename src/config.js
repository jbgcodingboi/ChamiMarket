export const APP_NAME = 'Chami Market'

export const STARTING_CASH = 100000
export const RESET_CASH = 50000

export const GAMMA_BASE = 'https://gamma-api.polymarket.com'
export const CLOB_BASE = 'https://clob.polymarket.com'

export const POLL_INTERVAL_MS = 30000
export const ORDER_BOOK_POLL_MS = 20000
export const REQUEST_TIMEOUT_MS = 7000
export const MIN_LIQUIDITY = 1000
export const SPORTS_MARKET_LIMIT = 200
export const POLITICS_MARKET_LIMIT = 60
export const MARKETS_PER_EVENT = 3
export const MAX_HELD_MARKET_REFRESH = 8

export const CATEGORIES = [
  { id: 'sports', label: 'Sports', tagSlug: 'sports' },
  { id: 'politics', label: 'Top Politics', tagSlug: 'politics' },
  // House markets on Chaminade High School (Mineola, NY) games, built by the snapshot job.
  { id: 'chaminade', label: 'Chaminade', tagSlug: null },
  // House-priced short markets: crypto windows, local weather, stocks and daily parlays.
  { id: 'quick', label: 'Quick', tagSlug: null },
]

/** Categories whose markets come from Polymarket tags. */
export const TAGGED_CATEGORIES = CATEGORIES.filter((c) => c.tagSlug)

export const MIN_ORDER = 0.01
export const MAX_FEED_ENTRIES = 300

/** Backend mode: simulated players fill the leaderboard up to this many rows, one leaving for each real player. */
export const LEADERBOARD_FILL = 15
export const MAX_HISTORY_ENTRIES = 1000
export const MAX_SNAPSHOTS = 400
export const MAX_KNOWN_MARKETS = 500
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000
