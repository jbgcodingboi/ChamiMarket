/**
 * Which markets are worth listing. Pure and data-only so the same rules run in
 * the browser, in the scheduled snapshot job and in tests.
 *
 * A market is listed only when it:
 *  - has an end date that is still in the future and no later than June 1, 2027
 *  - is priced between 6% and 95%, unless it is a ceasefire, alien, political
 *    agreement or championship-style market (those are listed at any price)
 *  - is not esports
 *  - for soccer: belongs to a top European league, the Champions League or the Ballon d'Or
 *  - for politics: is not a tweet/mention/meme market and is relevant to a US audience
 */
export const END_DATE_CUTOFF = Date.parse('2027-06-02T00:00:00Z')
export const MIN_PROBABILITY = 0.06
export const MAX_PROBABILITY = 0.95

const tagSet = (m) => new Set(m.tags ?? [])
const hasAny = (set, list) => list.some((t) => set.has(t))

// Soccer ------------------------------------------------------------------

export const TOP_SOCCER_LEAGUES = ['epl', 'lal', 'sea', 'bun', 'fl1', 'ucl']

const TOP_SOCCER_TAGS = [
  'epl', 'premier-league', 'premier league', 'english-premier-league', 'english premier league',
  'la-liga', 'la liga', 'laliga', 'serie-a', 'serie a', 'bundesliga', 'ligue-1', 'ligue 1',
  'champions-league', 'champions league', 'ucl', 'uefa-champions-league', 'uefa champions league',
  'ballon-dor', 'ballon-d-or', "ballon d'or",
]

const SOCCER_TAGS = ['soccer', 'futbol', 'football-soccer', 'mls', 'uefa', 'fifa', 'world-cup', 'fifa-world-cup',
  'europa-league', 'conference-league', 'liga-mx', 'eredivisie', 'brasileirao', 'saudi-pro-league', 'fa-cup',
  'copa-libertadores', 'efl-championship', 'nations-league', 'concacaf', 'conmebol', ...TOP_SOCCER_TAGS]

const SOCCER_TEXT =
  /\b(soccer|fc|uefa|fifa|ballon d'?or|champions league|europa league|conference league|la ?liga|serie a|bundesliga|ligue 1|eredivisie|liga mx|mls|fa cup|carabao cup|copa (america|libertadores|sudamericana|del rey)|club world cup|nations league|concacaf|conmebol|brasileir[aã]o|saudi pro league|english premier league)\b/

const TOP_SOCCER_TEXT =
  /\b(english premier league|premier league|la ?liga|serie a|bundesliga|ligue 1|champions league|ballon d'?or)\b/

const MINOR_SOCCER_TEXT =
  /(2\.? ?bundesliga|bundesliga 2|serie b|ligue 2|segunda|women|womens|\bwsl\b|nwsl|\bu-?(1[6-9]|2[0-3])\b|youth|\bcaf\b|afc champions|concacaf|conmebol|brasileir|série a|liga mx|\bmls\b|saudi|russian premier|egyptian|scottish|ukrainian premier|israeli premier|turkish|super lig|copa |europa league|conference league|fa cup|carabao|\befl\b|world cup|nations league|qualif|friendl)/

const soccerText = (m) => `${m.title} ${m.eventTitle ?? ''} ${(m.description ?? '').slice(0, 300)}`.toLowerCase()

export function isSoccer(m) {
  if (m.category !== 'sports') return false
  if (m.league && TOP_SOCCER_LEAGUES.includes(m.league)) return true
  return hasAny(tagSet(m), SOCCER_TAGS) || SOCCER_TEXT.test(soccerText(m))
}

export function isTopSoccer(m) {
  const text = soccerText(m)
  if (MINOR_SOCCER_TEXT.test(text)) return false
  if (m.league && TOP_SOCCER_LEAGUES.includes(m.league)) return true
  return hasAny(tagSet(m), TOP_SOCCER_TAGS) || TOP_SOCCER_TEXT.test(text)
}

// Politics ----------------------------------------------------------------

const JUNK_POLITICS =
  /(\b(tweets?|tweeted|retweets?|truth social|posts?|posted|mentions?|mentioned|say|says|wears?|elon|musk|kardashian|kanye|taylor swift|mrbeast|diddy|jesus|followers|subscribers)\b|# ?of\b|how many times|number of times)/

const MAJOR_INTERNATIONAL =
  /\b(israel|israeli|netanyahu|gaza|hamas|hezbollah|idf|west bank|iran|iranian|khamenei|russia|russian|putin|kremlin|ukraine|ukrainian|zelensky|crimea|china|chinese|xi jinping|beijing|taiwan|north korea|north korean|kim jong|nato|united nations|united kingdom|uk|britain|british|starmer|canada|canadian|carney|mexico|mexican|sheinbaum|venezuela|venezuelan|maduro|pope|vatican|syria|lebanon|houthis?|yemen|saudi)\b/

const US_CONTEXT = /\b(trump|vance|biden|harris|white house|united states|americans?|pentagon|state department)\b/

const MINOR_INTERNATIONAL = new RegExp(
  '\\b(' +
    [
      'brazil', 'brazilian', 'lula', 'bolsonaro', 'argentin\\w*', 'milei', 'chile', 'chilean', 'colombia\\w*',
      'peru', 'peruvian', 'ecuador\\w*', 'bolivia\\w*', 'paraguay\\w*', 'uruguay\\w*', 'costa rica\\w*',
      'honduras', 'guatemala\\w*', 'el salvador', 'bukele', 'panama\\w*', 'dominican republic',
      'poland', 'polish', 'romania\\w*', 'hungar\\w*', 'orb[aá]n', 'czech\\w*', 'slovak\\w*', 'portug\\w*',
      'netherlands', 'dutch', 'belgi\\w*', 'austria\\w*', 'switzerland', 'swiss', 'swed\\w*', 'norw\\w*',
      'denmark', 'danish', 'finland', 'finnish', 'ireland', 'irish', 'iceland\\w*', 'spain', 'spanish',
      's[aá]nchez', 'italy', 'italian', 'meloni', 'greece', 'greek', 'serbia\\w*', 'croatia\\w*', 'bosnia\\w*',
      'bulgaria\\w*', 'moldova\\w*', 'albania\\w*', 'kosovo', 'lithuania\\w*', 'latvia\\w*', 'estonia\\w*',
      'belarus\\w*', 'france', 'french', 'macron', 'germany', 'german', 'merz', 'afd', 'turkey', 'turkish',
      't[uü]rkiye', 'erdo[gğ]an', 'cyprus', 'malta', 'japan', 'japanese', 'ishiba', 'takaichi', 'south korea\\w*',
      'india', 'indian', 'modi', 'pakistan\\w*', 'bangladesh\\w*', 'sri lanka\\w*', 'nepal\\w*', 'indonesia\\w*',
      'philippines?', 'filipino', 'thailand', 'thai', 'malaysia\\w*', 'singapore\\w*', 'vietnam\\w*',
      'myanmar', 'hong kong', 'australia\\w*', 'albanese', 'new zealand', 'south africa\\w*', 'nigeria\\w*',
      'kenya\\w*', 'ethiopia\\w*', 'ghana\\w*', 'egypt\\w*', 'morocc\\w*', 'algeria\\w*', 'tunisia\\w*',
      'cameroon\\w*', 'senegal\\w*', 'uganda\\w*', 'tanzania\\w*', 'zimbabwe\\w*', 'iraq\\w*', 'qatar\\w*',
      'uae', 'emirat\\w*', 'kuwait\\w*', 'armenia\\w*', 'azerbaijan\\w*',
    ].join('|') +
    ')\\b',
)

const politicsText = (m) => `${m.title} ${m.eventTitle ?? ''}`

export function isJunkPolitics(m) {
  return JUNK_POLITICS.test(politicsText(m).toLowerCase())
}

/** Foreign politics most Americans don't follow, unless it touches a major story or the US. */
export function isLowRelevanceInternational(m) {
  const raw = politicsText(m)
  const text = raw.toLowerCase()
  if (!MINOR_INTERNATIONAL.test(text)) return false
  return !(MAJOR_INTERNATIONAL.test(text) || US_CONTEXT.test(text) || /\bU\.?S\.?\b/.test(raw))
}

// Esports -------------------------------------------------------------------

const ESPORTS_TAGS = ['esports', 'e-sports', 'league-of-legends', 'league of legends', 'counter-strike', 'cs2',
  'csgo', 'dota', 'dota-2', 'dota 2', 'valorant', 'overwatch', 'call-of-duty', 'call of duty', 'rocket-league',
  'rocket league', 'starcraft', 'rainbow-six', 'fortnite', 'pubg', 'mobile-legends', 'honor-of-kings']

const ESPORTS_TEXT =
  /(\be-?sports?\b|league of legends|^lol:|\blol (worlds|msi)\b|\b(lck|lpl|lec|lcs)\b|counter-?strike|\bcs ?2\b|\bcs:?go\b|\bdota\b|valorant|\bvct\b|overwatch|call of duty|rocket league|fortnite|starcraft|rainbow six|\bpubg\b|mobile legends|honor of kings|\biem\b|\besl (pro|one)\b|\bblast (premier|major)\b|\bpgl\b|\(bo[1357]\))/

export function isEsports(m) {
  return hasAny(tagSet(m), ESPORTS_TAGS) || ESPORTS_TEXT.test(`${m.title} ${m.eventTitle ?? ''}`.toLowerCase())
}

// Odds -----------------------------------------------------------------------

const CEASEFIRE = /\b(cease-?fire|truce|armistice)\b/
const ALIENS = /\b(aliens?|ufos?|uaps?|extraterrestrial)\b/
const AGREEMENT = /\b(agreements?|deals?|accords?|treaty|treaties|normaliz\w*|normalis\w*|peace (talks|plan|summit))\b/
const COMPETITION =
  /\b(championships?|champions?|titles?|finals?|super bowl|world series|stanley cup|cup|league|liga|serie a|bundesliga|ligue 1|ballon d'?or|mvp|awards?|trophy|pennant|division|conference|playoffs?|masters|open|grand prix|tournament|series)\b/

/** Championship-style futures, e.g. "Will the Lakers win the 2027 NBA Championship?" */
export function isChampionshipFuture(m) {
  if (m.category !== 'sports') return false
  const text = m.title.toLowerCase()
  return /\bwins?\b/.test(text) && COMPETITION.test(text) && !/\bvs\.?\b/.test(text)
}

/**
 * Market types listed at any price. Every other market must be priced
 * between 6% and 95%.
 */
export function isOddsExempt(m) {
  const text = `${m.title} ${m.eventTitle ?? ''}`.toLowerCase()
  if (CEASEFIRE.test(text) || ALIENS.test(text)) return true
  if (m.category === 'politics' && AGREEMENT.test(text)) return true
  return isChampionshipFuture(m)
}

// Shared ------------------------------------------------------------------

const endTime = (m) => (m.endDate ? Date.parse(m.endDate) : NaN)

/** True once the market's end date has passed. */
export function hasEnded(m, now = Date.now()) {
  const end = endTime(m)
  return Number.isFinite(end) && end <= now
}

/** Why a market is hidden, or null when it should be listed. */
export function exclusionReason(m, now = Date.now()) {
  const end = endTime(m)
  if (!Number.isFinite(end)) return 'no-end-date'
  if (end <= now) return 'ended'
  if (end >= END_DATE_CUTOFF) return 'ends-after-cutoff'
  if (m.category === 'sports' && isEsports(m)) return 'esports'
  if (m.category === 'sports' && isSoccer(m) && !isTopSoccer(m)) return 'minor-soccer'
  if (m.category === 'politics') {
    if (isJunkPolitics(m)) return 'junk-politics'
    if (isLowRelevanceInternational(m)) return 'low-relevance-international'
  }
  if ((m.yesPrice < MIN_PROBABILITY || m.yesPrice > MAX_PROBABILITY) && !isOddsExempt(m)) return 'lopsided-odds'
  return null
}

export const isListed = (m, now = Date.now()) => exclusionReason(m, now) === null

export const curate = (markets, now = Date.now()) => markets.filter((m) => isListed(m, now))
