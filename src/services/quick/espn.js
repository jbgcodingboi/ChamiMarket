/**
 * Fast settlement of tonight's pro games from ESPN's public scoreboard
 * (browser-callable). Polymarket's own resolution can take hours after a game
 * ends; once ESPN marks a game final, a held moneyline market (two team-name
 * outcomes) settles on the next refresh. Only markets whose outcome labels
 * match both teams of a single ESPN game are touched.
 */
import { addDays, compactDate, etDate } from '../../utils/time.js'
import { fetchJson } from '../http.js'

export const ESPN_LEAGUES = {
  nfl: 'football/nfl',
  cfb: 'football/college-football',
  nba: 'basketball/nba',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
}

const norm = (s) => (typeof s === 'string' ? s.toLowerCase().replace(/[^a-z0-9]/g, '') : '')

export function parseScoreboard(json) {
  const events = Array.isArray(json?.events) ? json.events : []
  return events
    .map((e) => {
      const c = e?.competitions?.[0]
      const competitors = (Array.isArray(c?.competitors) ? c.competitors : []).map((t) => {
        const team = t?.team ?? {}
        const names = [team.name, team.shortDisplayName, team.displayName, team.abbreviation, team.location, `${team.location ?? ''} ${team.name ?? ''}`]
          .map(norm)
          .filter(Boolean)
        return { names: [...new Set(names)], winner: t?.winner === true, score: Number(t?.score) }
      })
      const type = e?.status?.type ?? {}
      return { start: Date.parse(e?.date), completed: type.completed === true && type.state === 'post', competitors }
    })
    .filter((g) => g.competitors.length === 2)
}

const matches = (label, competitor) => {
  const l = norm(label)
  return l.length >= 3 && competitor.names.some((n) => n === l)
}

/** The ESPN game whose two teams are the market's two outcomes. */
export function findGame(market, games) {
  const { yes, no } = market.labels
  return (
    games.find((g) => {
      const [a, b] = g.competitors
      return (matches(yes, a) && matches(no, b)) || (matches(yes, b) && matches(no, a))
    }) ?? null
  )
}

export function espnOutcome(market, games) {
  const game = findGame(market, games)
  if (!game || !game.completed) return null
  const winner = game.competitors.find((c) => c.winner)
  if (!winner) return null
  if (matches(market.labels.yes, winner)) return 'yes'
  if (matches(market.labels.no, winner)) return 'no'
  return null
}

/** True for a two-team moneyline market in a league ESPN covers. */
export const isEspnSettleable = (m) =>
  Boolean(m && ESPN_LEAGUES[m.league] && m.labels && m.labels.yes !== 'Yes' && m.labels.no !== 'No' && !/\b(spread|o\/u|over|under|total)\b|\(/i.test(m.title))

/** Scoreboards for the game's date (ESPN dates are Eastern); without a start time, the end date and the day before. */
export async function fetchGamesFor(market) {
  const start = Date.parse(market.gameStart ?? '')
  const end = Date.parse(market.endDate)
  const dates = Number.isFinite(start) ? [etDate(start)] : [...new Set([etDate(end), addDays(etDate(end), -1)])]
  const boards = await Promise.allSettled(
    dates.map((d) =>
      fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_LEAGUES[market.league]}/scoreboard?dates=${compactDate(d)}`, {
        memoMs: 60000,
      }),
    ),
  )
  return boards.flatMap((b) => (b.status === 'fulfilled' ? parseScoreboard(b.value) : []))
}
