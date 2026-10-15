/**
 * Bundled offline dataset. Used whenever the live API is unreachable so the
 * app stays fully usable with no network. Dates are relative to load time so
 * the markets always look current.
 */
const DAY = 864e5

const SPORTS = [
  ['World Series 2026: Will it go to Game 7?', 0.27, 18.4e6, 9, 41, 'Resolves Yes if the 2026 World Series requires a seventh game. Resolves No if either team clinches in six or fewer games, or the series is cancelled.'],
  ['Chiefs vs. Bills: Who wins in Week 8?', 0.54, 6.1e6, 6, 9, 'Resolves to the team that wins the regular-season game, including overtime.', ['Chiefs', 'Bills']],
  ['Will the Thunder win the 2027 NBA Finals?', 0.21, 42.7e6, 245, 120, 'Resolves Yes if the Oklahoma City Thunder are crowned 2027 NBA champions.'],
  ['Will the Celtics win the 2027 NBA Finals?', 0.12, 31.2e6, 245, 120, 'Resolves Yes if the Boston Celtics are crowned 2027 NBA champions.'],
  ['Lakers vs. Warriors: Opening week matchup', 0.47, 3.3e6, 7, 12, 'Resolves to the winner of the scheduled regular-season game, including overtime.', ['Lakers', 'Warriors']],
  ['Will an AFC team win Super Bowl LXI?', 0.56, 22.9e6, 118, 200, 'Resolves Yes if the Super Bowl LXI champion represents the American Football Conference.'],
  ['Will Real Madrid win the 2026–27 Champions League?', 0.17, 15.6e6, 225, 90, 'Resolves Yes if Real Madrid wins the 2026–27 UEFA Champions League final.'],
  ['Will Arsenal win the 2026–27 Premier League?', 0.31, 19.8e6, 215, 110, 'Resolves Yes if Arsenal finishes first in the 2026–27 Premier League table.'],
  ['Will Ohio State win the 2026–27 CFP National Championship?', 0.14, 8.7e6, 88, 150, 'Resolves Yes if Ohio State wins the College Football Playoff National Championship game.'],
  ['Will the Panthers win the 2027 Stanley Cup?', 0.09, 5.2e6, 238, 100, 'Resolves Yes if the Florida Panthers win the 2027 Stanley Cup Final.'],
  ['Will any NFL team finish the 2026 regular season undefeated?', 0.04, 2.4e6, 82, 60, 'Resolves Yes if any team completes the 2026 NFL regular season with zero losses (ties allowed).'],
  ['Will the Bills win the AFC East in 2026?', 0.63, 4.8e6, 82, 140, 'Resolves Yes if the Buffalo Bills win the 2026 AFC East division title.'],
  ['Will a rookie lead the NBA in scoring in 2026–27?', 0.06, 1.1e6, 182, 20, 'Resolves Yes if the player with the highest points per game among qualified players in the 2026–27 regular season is a rookie.'],
]

const POLITICS = [
  ['Will Democrats win the House in the 2026 midterms?', 0.68, 96.5e6, 20, 300, 'Resolves Yes if the Democratic Party wins a majority of seats in the U.S. House of Representatives in the November 3, 2026 elections, as projected by major networks and confirmed by certified results.'],
  ['Will Republicans keep the Senate after the 2026 midterms?', 0.71, 88.1e6, 20, 300, 'Resolves Yes if the Republican Party holds a majority of U.S. Senate seats (51 or more, or 50 with the Vice President) following the 2026 elections.'],
  ['2026 midterm turnout above 50%?', 0.38, 7.4e6, 25, 90, 'Resolves Yes if the voting-eligible population turnout for the 2026 U.S. general election exceeds 50.0% according to the U.S. Elections Project.'],
  ['Will Democrats win the Georgia Senate race in 2026?', 0.57, 21.3e6, 20, 210, 'Resolves Yes if the Democratic candidate wins the 2026 U.S. Senate election in Georgia, including any runoff.'],
  ['Will the Texas Senate race be decided by less than 5 points?', 0.33, 6.9e6, 22, 150, 'Resolves Yes if the certified margin between the top two candidates in the 2026 Texas U.S. Senate race is under 5.0 percentage points.'],
  ['Federal government shutdown before December 31, 2026?', 0.24, 12.6e6, 77, 45, 'Resolves Yes if a lapse in federal appropriations causes a government shutdown at any point before 11:59 PM ET on December 31, 2026.'],
  ['Will a Democrat win the 2026 California governor race?', 0.89, 14.2e6, 20, 260, 'Resolves Yes if a Democratic Party candidate is elected Governor of California in November 2026.'],
  ['Supreme Court vacancy announced before July 2027?', 0.19, 9.8e6, 258, 70, 'Resolves Yes if a sitting U.S. Supreme Court justice announces retirement, dies, or otherwise leaves the Court before July 1, 2027.'],
  ['Will Republicans flip a Democratic-held Senate seat in 2026?', 0.46, 11.5e6, 20, 180, 'Resolves Yes if Republicans win at least one U.S. Senate seat held by a Democrat or Democratic-caucusing independent going into the 2026 election.'],
  ['UK general election called before 2028?', 0.11, 4.1e6, 442, 130, 'Resolves Yes if a United Kingdom general election is formally called before January 1, 2028.'],
  ['Will any 2026 Senate race require a recount?', 0.29, 3.6e6, 50, 40, 'Resolves Yes if any 2026 U.S. Senate general election triggers an official statewide recount.'],
  ['Will the House majority be decided by 5 seats or fewer?', 0.52, 8.3e6, 40, 75, 'Resolves Yes if the party winning the House majority after the 2026 elections holds a margin of five or fewer seats over 218.'],
]

function build(rows, category, prefix, now) {
  return rows.map(([title, yes, volume, endsInDays, createdDaysAgo, description, labels], i) => {
    const noPrice = Math.round((1 - yes) * 1000) / 1000
    return {
      id: `${prefix}${i + 1}`,
      slug: `${prefix}${i + 1}`,
      title,
      description,
      eventTitle: '',
      category,
      image: null,
      labels: labels ? { yes: labels[0], no: labels[1] } : { yes: 'Yes', no: 'No' },
      yesPrice: yes,
      noPrice,
      tokenIds: null,
      volume,
      volume24h: Math.round(volume * 0.035),
      liquidity: Math.round(volume * 0.02),
      endDate: new Date(now + endsInDays * DAY).toISOString(),
      createdAt: new Date(now - createdDaysAgo * DAY).toISOString(),
      active: true,
      closed: false,
      acceptingOrders: true,
      resolvedOutcome: null,
      source: 'mock',
    }
  })
}

export function createMockMarkets(now = Date.now()) {
  return [...build(SPORTS, 'sports', 'mock-s', now), ...build(POLITICS, 'politics', 'mock-p', now)]
}

export const isMockId = (id) => typeof id === 'string' && id.startsWith('mock-')
