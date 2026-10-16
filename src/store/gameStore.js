import { roundMoney } from '../utils/math.js'
import { isPlainObject } from '../utils/storage.js'
import { useAccountStore } from './accountStore.js'

/**
 * Games bet with the signed-in account's portfolio cash, so wins and losses
 * move net worth, the equity chart and leaderboard rank like any trade.
 * Round records live on the portfolio under `games`: a capped log, lifetime
 * stats per game, the net for the current run, and payouts still animating.
 */
const MAX_HISTORY = 200

const EMPTY = Object.freeze({ history: [], stats: {}, pending: [], run: 0, runNet: 0, runRounds: 0, runWagered: 0, runBest: 0 })

const isStat = (v) => isPlainObject(v) && ['rounds', 'wagered', 'net', 'best'].every((k) => Number.isFinite(v[k]))
const isPending = (b) => isPlainObject(b) && typeof b.id === 'string' && typeof b.game === 'string' && Number.isFinite(b.staked) && Number.isFinite(b.returned)
// Every stat and pending payout is checked, so one tampered entry can't crash the leaderboard or a payout.
const isGames = (g) =>
  isPlainObject(g) &&
  Array.isArray(g.history) &&
  g.history.every((e) => isPlainObject(e) && Number.isFinite(e.staked) && Number.isFinite(e.net)) &&
  isPlainObject(g.stats) &&
  Object.values(g.stats).every(isStat) &&
  Array.isArray(g.pending) &&
  g.pending.every(isPending)

export const gamesOf = (portfolio) => (isGames(portfolio?.games) ? portfolio.games : EMPTY)

const NO_RUN = Object.freeze({ net: 0, rounds: 0, wagered: 0, best: 0 })

/** Net, rounds, amount wagered and biggest single win from games in the portfolio's current run. */
export function runGames(portfolio) {
  const g = gamesOf(portfolio)
  if (g.run !== portfolio?.run) return NO_RUN
  return { net: g.runNet ?? 0, rounds: g.runRounds ?? 0, wagered: g.runWagered ?? 0, best: g.runBest ?? 0 }
}

/** The game with the most rounds played, or null. */
export function favoriteGame(portfolio) {
  const entries = Object.entries(gamesOf(portfolio).stats)
  if (!entries.length) return null
  return entries.reduce((a, b) => (b[1].rounds > a[1].rounds ? b : a))[0]
}

export const useChips = () => useAccountStore((s) => s.portfolio?.cash ?? 0)
export const useGames = (selector) => useAccountStore((s) => selector(gamesOf(s.portfolio)))

let counter = 0
const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

const current = () => useAccountStore.getState().portfolio

function commit(portfolio) {
  const store = useAccountStore.getState()
  store.commit(portfolio)
  store.snapshot()
}

/** Adds a finished round to the log and stats, crediting `returned` to cash. */
function record(portfolio, { game, staked, returned, detail }) {
  const g = gamesOf(portfolio)
  const net = roundMoney(returned - staked)
  const entry = { id: newId('g'), ts: Date.now(), run: portfolio.run, game, staked: roundMoney(staked), returned: roundMoney(returned), net, detail }
  const prev = g.stats[game] ?? { rounds: 0, wagered: 0, net: 0, best: 0 }
  const sameRun = g.run === portfolio.run
  const games = {
    ...g,
    history: [entry, ...g.history].slice(0, MAX_HISTORY),
    stats: {
      ...g.stats,
      [game]: { rounds: prev.rounds + 1, wagered: roundMoney(prev.wagered + staked), net: roundMoney(prev.net + net), best: Math.max(prev.best, net) },
    },
    run: portfolio.run,
    runNet: roundMoney((sameRun ? g.runNet : 0) + net),
    runRounds: (sameRun ? g.runRounds : 0) + 1,
    runWagered: roundMoney((sameRun ? (g.runWagered ?? 0) : 0) + staked),
    runBest: Math.max(sameRun ? (g.runBest ?? 0) : 0, net),
  }
  return { portfolio: { ...portfolio, cash: roundMoney(portfolio.cash + returned), games }, entry }
}

/** Takes a stake from cash. Returns the run it was taken in, or null without an account or enough cash. */
export function debit(amount) {
  const p = current()
  const stake = roundMoney(amount)
  if (!p || !(stake > 0) || stake > p.cash + 1e-9) return null
  commit({ ...p, cash: roundMoney(p.cash - stake) })
  return p.run
}

/**
 * Pays out a finished round whose stakes were already debited. Ignored when
 * the balance was reset since the round started (`run` no longer matches).
 */
export function settle({ run, ...bet }) {
  const p = current()
  if (!p || (run !== undefined && run !== p.run)) return null
  const { portfolio, entry } = record(p, bet)
  commit(portfolio)
  return entry
}

/**
 * Debits a round whose outcome is already drawn but still animating, and
 * holds the payout until `finish(id)`. A round left mid-animation is paid
 * out by `flush`, so leaving the page never loses the payout.
 */
export function place({ game, staked, returned, detail }) {
  const p = current()
  const stake = roundMoney(staked)
  if (!p || !(stake > 0) || stake > p.cash + 1e-9) return null
  const g = gamesOf(p)
  const id = newId('p')
  commit({ ...p, cash: roundMoney(p.cash - stake), games: { ...g, pending: [...g.pending, { id, run: p.run, game, staked: stake, returned, detail }] } })
  return id
}

export function finish(id) {
  const p = current()
  const g = gamesOf(p)
  const bet = g.pending.find((b) => b.id === id)
  if (!p || !bet) return null
  const rest = { ...p, games: { ...g, pending: g.pending.filter((b) => b.id !== id) } }
  if (bet.run !== p.run) {
    commit(rest)
    return null
  }
  const { portfolio, entry } = record(rest, bet)
  commit(portfolio)
  adoptWhenIdle()
  return entry
}

/** Pays out every held round (for one game, or all). */
export function flush(game) {
  for (const b of gamesOf(current()).pending) if (!game || b.game === game) finish(b.id)
}

/*
 * Backend mode: the server has already settled the round, but the screen
 * still animates it with place()/finish() on the in-memory portfolio. The
 * server's portfolio is held here and replaces the animated one as soon as
 * nothing is left in flight, so the final numbers are always the server's.
 */
let serverPortfolio = null

export function holdServerPortfolio(raw) {
  serverPortfolio = raw
  adoptWhenIdle()
}

function adoptWhenIdle() {
  if (serverPortfolio && !gamesOf(current()).pending.length) {
    useAccountStore.getState().adoptRemote(serverPortfolio)
    serverPortfolio = null
  }
}
