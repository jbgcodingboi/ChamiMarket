/**
 * Sub-categories of the Sports category, by sport or league. Pure and
 * data-only so the rules can be unit tested.
 *
 * A market is classified by, in order:
 *  1. its Gamma league code (set on markets from the league game feeds)
 *  2. its event tags (lowercase slugs and labels)
 *  3. keywords in its title and event title, then in its description
 * and lands in "other" when nothing matches. In each step the rules are tried
 * in list order, so specific leagues come before the sport they belong to
 * (e.g. the Champions League before the domestic soccer leagues, college
 * before pro).
 */

export const ALL_SPORTS = 'all'
export const OTHER_SPORT = 'other'

export const SPORT_SUBCATEGORIES = [
  {
    id: 'nfl',
    label: 'NFL',
    leagues: ['nfl'],
    tags: ['nfl', 'national football league', 'super-bowl', 'super bowl'],
    text: /\b(nfl|super bowl|afc (east|west|north|south|championship)|nfc (east|west|north|south|championship)|pro bowl)\b/,
  },
  {
    id: 'cfb',
    label: 'College football',
    leagues: ['cfb', 'ncaaf'],
    tags: ['cfb', 'ncaaf', 'college-football', 'college football', 'ncaa-football', 'cfp', 'heisman'],
    text: /\b(college football|ncaaf|cfp|heisman|(rose|sugar|orange|cotton|fiesta|peach) bowl)\b/,
  },
  {
    id: 'nba',
    label: 'NBA',
    leagues: ['nba'],
    tags: ['nba', 'nba-finals', 'nba finals'],
    text: /\b(nba)\b/,
  },
  {
    id: 'cbb',
    label: 'College basketball',
    leagues: ['cbb', 'ncaab', 'cwbb'],
    tags: ['cbb', 'ncaab', 'college-basketball', 'college basketball', 'march-madness', 'march madness', 'ncaa-basketball'],
    text: /\b(college basketball|ncaab|march madness|final four|ncaa tournament)\b/,
  },
  {
    id: 'mlb',
    label: 'MLB',
    leagues: ['mlb'],
    tags: ['mlb', 'world-series', 'world series'],
    text: /\b(mlb|world series|(al|nl) (east|west|central|pennant)|cy young)\b/,
  },
  {
    id: 'nhl',
    label: 'NHL',
    leagues: ['nhl'],
    tags: ['nhl', 'stanley-cup', 'stanley cup'],
    text: /\b(nhl|stanley cup)\b/,
  },
  {
    id: 'ucl',
    label: 'Champions League',
    leagues: ['ucl'],
    tags: ['ucl', 'champions-league', 'champions league', 'uefa-champions-league', 'uefa champions league'],
    text: /\b(champions league|ucl)\b/,
  },
  {
    id: 'epl',
    label: 'Premier League',
    leagues: ['epl'],
    tags: ['epl', 'premier-league', 'premier league', 'english-premier-league', 'english premier league'],
    text: /\b(premier league|epl)\b/,
  },
  {
    id: 'laliga',
    label: 'La Liga',
    leagues: ['lal'],
    tags: ['la-liga', 'la liga', 'laliga'],
    text: /\bla ?liga\b/,
  },
  {
    id: 'seriea',
    label: 'Serie A',
    leagues: ['sea'],
    tags: ['serie-a', 'serie a'],
    text: /\bserie a\b/,
  },
  {
    id: 'bundesliga',
    label: 'Bundesliga',
    leagues: ['bun'],
    tags: ['bundesliga'],
    text: /\bbundesliga\b/,
  },
  {
    id: 'ligue1',
    label: 'Ligue 1',
    leagues: ['fl1'],
    tags: ['ligue-1', 'ligue 1'],
    text: /\bligue 1\b/,
  },
  {
    id: 'soccer',
    label: 'Soccer',
    leagues: ['mls', 'uel', 'fifa'],
    tags: ['soccer', 'futbol', 'football-soccer', 'ballon-dor', 'ballon-d-or', "ballon d'or", 'fifa', 'uefa'],
    text: /\b(soccer|fifa|uefa|ballon d'?or)\b/,
  },
  {
    id: 'tennis',
    label: 'Tennis',
    leagues: ['atp', 'wta', 'tennis'],
    tags: ['tennis', 'atp', 'wta', 'wimbledon', 'roland-garros', 'australian-open', 'us-open-tennis'],
    text: /\b(tennis|atp|wta|wimbledon|roland garros|french open|australian open|davis cup)\b/,
  },
  {
    id: 'golf',
    label: 'Golf',
    leagues: ['golf', 'pga', 'lpga', 'liv'],
    tags: ['golf', 'pga', 'pga-tour', 'lpga', 'liv-golf', 'the-masters', 'masters', 'ryder-cup'],
    text: /\b(golf|pga|lpga|the masters|ryder cup|open championship)\b/,
  },
  {
    id: 'mma',
    label: 'UFC/MMA',
    leagues: ['ufc', 'mma'],
    tags: ['ufc', 'mma', 'mixed-martial-arts', 'mixed martial arts'],
    text: /\b(ufc|mma|mixed martial arts|bellator)\b/,
  },
  {
    id: 'boxing',
    label: 'Boxing',
    leagues: ['boxing'],
    tags: ['boxing'],
    text: /\b(boxing|boxer|wbc|wbo|ibf)\b/,
  },
  {
    id: 'motorsport',
    label: 'F1/Motorsport',
    leagues: ['f1', 'nascar', 'indycar', 'motogp'],
    tags: ['f1', 'formula-1', 'formula 1', 'formula1', 'motorsport', 'motorsports', 'nascar', 'indycar', 'motogp'],
    text: /\b(f1|formula (1|one)|grand prix|nascar|indycar|motogp|le mans|indy 500|daytona 500)\b/,
  },
  { id: OTHER_SPORT, label: 'Other', leagues: [], tags: [], text: null },
]

const BY_LEAGUE = new Map(SPORT_SUBCATEGORIES.flatMap((s) => s.leagues.map((l) => [l, s.id])))
const RULES = SPORT_SUBCATEGORIES.filter((s) => s.text)
const IDS = new Set(SPORT_SUBCATEGORIES.map((s) => s.id))

export const isSportSubcategory = (id) => IDS.has(id)

const matchText = (text) => RULES.find((s) => s.text.test(text))?.id ?? null

/** The sub-category id of a Sports market. */
export function sportSubcategory(m) {
  const league = typeof m?.league === 'string' ? m.league.toLowerCase() : ''
  if (BY_LEAGUE.has(league)) return BY_LEAGUE.get(league)

  const tags = new Set(Array.isArray(m?.tags) ? m.tags : [])
  const tagged = RULES.find((s) => s.tags.some((t) => tags.has(t)))
  if (tagged) return tagged.id

  const title = `${m?.title ?? ''} ${m?.eventTitle ?? ''}`.toLowerCase()
  const desc = String(m?.description ?? '').slice(0, 300).toLowerCase()
  return matchText(title) ?? matchText(desc) ?? OTHER_SPORT
}

/** Market count per sub-category, for Sports markets only. */
export function countSports(markets) {
  const counts = {}
  for (const m of markets) {
    if (m.category !== 'sports') continue
    const id = sportSubcategory(m)
    counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

/** "All sports" plus each sub-category that has markets, in list order, with counts. */
export function sportTabs(markets) {
  const counts = countSports(markets)
  const all = Object.values(counts).reduce((a, b) => a + b, 0)
  return [
    { id: ALL_SPORTS, label: 'All sports', count: all },
    ...SPORT_SUBCATEGORIES.filter((s) => counts[s.id]).map((s) => ({ id: s.id, label: s.label, count: counts[s.id] })),
  ]
}

/** The selection to apply: the chosen sub-category if it has markets, otherwise "All sports". */
export function effectiveSport(sport, markets) {
  if (sport === ALL_SPORTS || !isSportSubcategory(sport)) return ALL_SPORTS
  return markets.some((m) => m.category === 'sports' && sportSubcategory(m) === sport) ? sport : ALL_SPORTS
}
