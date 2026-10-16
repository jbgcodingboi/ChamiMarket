/**
 * Bundled offline dataset, used only when neither the live API nor the
 * deployed snapshot is reachable. Season and election markets use real
 * calendar dates and drop out once they end; the "this week" games roll
 * forward so offline mode always has something to trade. Every entry passes
 * the same curation rules as live data.
 */
const DAY = 864e5

// [title, yes price, volume, end, description, labels?, league?]
// end is an ISO date (fixed) or a number of days from now (rolling).
const SPORTS = [
  ['Chiefs vs. Bills', 0.54, 6.1e6, 3, 'Resolves to the winner of the game, including overtime.', ['Chiefs', 'Bills'], 'nfl'],
  ['Eagles vs. Cowboys', 0.61, 5.4e6, 4, 'Resolves to the winner of the game, including overtime.', ['Eagles', 'Cowboys'], 'nfl'],
  ['49ers vs. Packers', 0.48, 3.9e6, 5, 'Resolves to the winner of the game, including overtime.', ['49ers', 'Packers'], 'nfl'],
  ['Lakers vs. Warriors', 0.47, 3.3e6, 2, 'Resolves to the winner of the game, including overtime.', ['Lakers', 'Warriors'], 'nba'],
  ['Celtics vs. Knicks', 0.58, 2.8e6, 1, 'Resolves to the winner of the game, including overtime.', ['Celtics', 'Knicks'], 'nba'],
  ['Rangers vs. Bruins', 0.51, 1.2e6, 2, 'Resolves to the winner of the game, including overtime and shootout.', ['Rangers', 'Bruins'], 'nhl'],
  ['Arsenal vs. Chelsea', 0.49, 4.6e6, 5, 'Premier League match. Resolves to the winner after 90 minutes plus stoppage time; a draw resolves No for both.', ['Arsenal', 'Chelsea'], 'epl'],
  ['Liverpool vs. Manchester City', 0.44, 4.2e6, 3, 'Premier League match. Resolves to the winner after 90 minutes plus stoppage time.', ['Liverpool', 'Man City'], 'epl'],
  ['Real Madrid vs. Barcelona', 0.46, 7.8e6, 6, 'La Liga match. Resolves to the winner after 90 minutes plus stoppage time.', ['Real Madrid', 'Barcelona'], 'lal'],
  ['Inter vs. AC Milan', 0.5, 2.2e6, 6, 'Serie A match. Resolves to the winner after 90 minutes plus stoppage time.', ['Inter', 'AC Milan'], 'sea'],
  ['Bayern Munich vs. Borussia Dortmund', 0.68, 2.9e6, 5, 'Bundesliga match. Resolves to the winner after 90 minutes plus stoppage time.', ['Bayern', 'Dortmund'], 'bun'],
  ['PSG vs. Marseille', 0.7, 1.8e6, 4, 'Ligue 1 match. Resolves to the winner after 90 minutes plus stoppage time.', ['PSG', 'Marseille'], 'fl1'],
  ['World Series 2026: Will it go to Game 7?', 0.27, 18.4e6, '2026-11-05', 'Resolves Yes if the 2026 World Series requires a seventh game.', null, 'mlb'],
  ['Will the American League win the 2026 World Series?', 0.52, 12.1e6, '2026-11-05', 'Resolves Yes if the American League champion wins the 2026 World Series.', null, 'mlb'],
  ['Will the Chiefs make the 2026–27 NFL playoffs?', 0.71, 9.3e6, '2027-01-11', 'Resolves Yes if the Kansas City Chiefs qualify for the 2026–27 NFL playoffs.', null, 'nfl'],
  ['Will the Bills win the AFC East in 2026?', 0.63, 4.8e6, '2027-01-11', 'Resolves Yes if the Buffalo Bills win the 2026 AFC East division title.', null, 'nfl'],
  ['Will an AFC team win Super Bowl LXI?', 0.56, 22.9e6, '2027-02-15', 'Resolves Yes if the Super Bowl LXI champion represents the American Football Conference.', null, 'nfl'],
  ['Will Ohio State win the 2026–27 CFP National Championship?', 0.14, 8.7e6, '2027-01-20', 'Resolves Yes if Ohio State wins the College Football Playoff National Championship game.', null, 'cfb'],
  ['Will the Lakers have a winning record at the 2027 All-Star break?', 0.52, 1.6e6, '2027-02-12', 'Resolves Yes if the Lakers have more wins than losses at the start of the 2027 All-Star break.', null, 'nba'],
  ['Will Arsenal win the 2026–27 Premier League?', 0.31, 19.8e6, '2027-05-24', 'Resolves Yes if Arsenal finishes first in the 2026–27 Premier League table.', null, 'epl'],
  ['Will Real Madrid win the 2026–27 La Liga?', 0.44, 9.6e6, '2027-05-31', 'Resolves Yes if Real Madrid finishes first in the 2026–27 La Liga table.', null, 'lal'],
  ['Will Bayern Munich win the 2026–27 Bundesliga?', 0.78, 6.2e6, '2027-05-24', 'Resolves Yes if Bayern Munich finishes first in the 2026–27 Bundesliga table.', null, 'bun'],
  ['Will Inter win the 2026–27 Serie A?', 0.24, 4.4e6, '2027-05-31', 'Resolves Yes if Inter finishes first in the 2026–27 Serie A table.', null, 'sea'],
  ['Will an English club win the 2026–27 Champions League?', 0.38, 14.7e6, '2027-05-31', 'Resolves Yes if a Premier League club wins the 2026–27 UEFA Champions League final.', null, 'ucl'],
]

const POLITICS = [
  ['Will Democrats win the House in the 2026 midterms?', 0.68, 96.5e6, '2026-11-04', 'Resolves Yes if the Democratic Party wins a majority of seats in the U.S. House of Representatives in the November 3, 2026 elections.'],
  ['Will Republicans keep the Senate after the 2026 midterms?', 0.71, 88.1e6, '2026-11-04', 'Resolves Yes if the Republican Party holds a majority of U.S. Senate seats following the 2026 elections.'],
  ['Will Democrats win the Georgia Senate race in 2026?', 0.57, 21.3e6, '2026-11-04', 'Resolves Yes if the Democratic candidate wins the 2026 U.S. Senate election in Georgia, including any runoff.'],
  ['Will the Texas Senate race be decided by less than 5 points?', 0.33, 6.9e6, '2026-11-04', 'Resolves Yes if the margin between the top two candidates in the 2026 Texas U.S. Senate race is under 5.0 points.'],
  ['Will a Democrat win the 2026 California governor race?', 0.89, 14.2e6, '2026-11-04', 'Resolves Yes if a Democratic Party candidate is elected Governor of California in November 2026.'],
  ['Will the House majority be decided by 5 seats or fewer?', 0.52, 8.3e6, '2026-12-01', 'Resolves Yes if the party winning the House majority holds a margin of five or fewer seats over 218.'],
  ['Will any 2026 Senate race require a recount?', 0.29, 3.6e6, '2026-12-15', 'Resolves Yes if any 2026 U.S. Senate general election triggers an official statewide recount.'],
  ['Federal government shutdown before December 31, 2026?', 0.24, 12.6e6, '2026-12-31', 'Resolves Yes if a lapse in federal appropriations causes a government shutdown before 11:59 PM ET on December 31, 2026.'],
  ['Will Israel and Saudi Arabia announce normalization by March 31, 2027?', 0.12, 9.1e6, '2027-03-31', 'Resolves Yes if Israel and Saudi Arabia publicly announce an agreement to establish diplomatic relations by March 31, 2027.'],
  ['Russia x Ukraine ceasefire by March 31, 2027?', 0.18, 31.4e6, '2027-03-31', 'Resolves Yes if Russia and Ukraine agree to a general ceasefire that takes effect by March 31, 2027.'],
  ['Will the U.S. and Iran reach a nuclear agreement by June 1, 2027?', 0.15, 7.7e6, '2027-06-01', 'Resolves Yes if the United States and Iran publicly announce a nuclear agreement by June 1, 2027.'],
  ['Supreme Court vacancy announced before June 1, 2027?', 0.17, 9.8e6, '2027-06-01', 'Resolves Yes if a sitting U.S. Supreme Court justice announces retirement, dies, or otherwise leaves the Court before June 1, 2027.'],
]

const resolveEnd = (end, now) =>
  typeof end === 'number' ? new Date(now + end * DAY).toISOString() : `${end}T23:59:00.000Z`

function build(rows, category, prefix, now) {
  return rows.map(([title, yes, volume, end, description, labels, league], i) => ({
    id: `${prefix}${i + 1}`,
    slug: `${prefix}${i + 1}`,
    title,
    description,
    eventTitle: '',
    category,
    league: league ?? null,
    tags: [],
    image: null,
    labels: labels ? { yes: labels[0], no: labels[1] } : { yes: 'Yes', no: 'No' },
    yesPrice: yes,
    noPrice: Math.round((1 - yes) * 1000) / 1000,
    tokenIds: null,
    volume,
    volume24h: Math.round(volume * 0.035),
    liquidity: Math.round(volume * 0.02),
    endDate: resolveEnd(end, now),
    createdAt: new Date(now - (20 + i * 7) * DAY).toISOString(),
    active: true,
    closed: false,
    acceptingOrders: true,
    resolvedOutcome: null,
    source: 'mock',
  }))
}

export function createMockMarkets(now = Date.now()) {
  return [...build(SPORTS, 'sports', 'demo-s', now), ...build(POLITICS, 'politics', 'demo-p', now)]
}

/** Demo ids, including those from the earlier bundled dataset ("mock-"). */
export const isMockId = (id) => typeof id === 'string' && (id.startsWith('demo-') || id.startsWith('mock-'))
