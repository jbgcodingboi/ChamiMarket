/**
 * Mines and Chicken Cross rounds, which take several steps. Both modes return
 * the same round "view" the server sends (supabase/schema.sql mines_view and
 * chicken_view): hidden outcomes stay out of it until the round is over. In
 * local mode the round is kept in this browser and paid with debit/settle.
 */
import * as chicken from '../../games/chicken.js'
import * as mines from '../../games/mines.js'
import { useAccountStore } from '../../store/accountStore.js'
import { debit, settle } from '../../store/gameStore.js'
import { roundMoney } from '../../utils/math.js'
import { isPlainObject, readJSON, writeJSON } from '../../utils/storage.js'
import * as backend from '../backend/api.js'
import { BACKEND_ENABLED } from '../backend/config.js'
import { crashInPlay, nextFloats, roundKey, useFairStore } from './fairSeeds.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

async function remote(call) {
  const res = await call()
  useAccountStore.getState().adoptRemote(res.portfolio)
  if (res.round?.nonce !== undefined) useFairStore.getState().used(res.round.nonce)
  return res.round
}

const isTileList = (v) => Array.isArray(v) && v.every((t) => Number.isInteger(t) && t >= 0 && t <= 24)
/** A stored round with the fields the views read, so edited or stale storage can't crash the page. */
const ROUND_SHAPES = {
  mines: (s) => isTileList(s.revealed) && isTileList(s.positions) && Number.isInteger(s.mines) && s.mines >= 1 && s.mines <= 24,
  chicken: (s) => Boolean(chicken.DIFFICULTIES[s.difficulty]) && Number.isInteger(s.lane) && s.lane >= 0,
}
const isRound = (game) => (s) =>
  isPlainObject(s) && (s.phase === 'playing' || s.phase === 'done') && Number.isFinite(s.bet) && ROUND_SHAPES[game](s)

const load = (game) => {
  const s = readJSON(roundKey(game), isRound(game), null)
  // A balance reset ends the run, so a round from before it is void.
  if (s?.phase === 'playing' && s.run !== useAccountStore.getState().portfolio?.run) return null
  return s
}
const save = (game, s) => writeJSON(roundKey(game), s)

function stake(amount) {
  const bet = roundMoney(amount)
  if (!(bet >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
  const run = debit(bet)
  if (!run) throw new Error('Not enough chips for this bet.')
  return { bet, run }
}

// Mines -------------------------------------------------------------------------

export function minesView(s) {
  if (!s) return { phase: 'idle' }
  const gems = s.revealed.length
  return {
    phase: s.phase,
    bet: s.bet,
    mines: s.mines,
    revealed: s.revealed,
    gems,
    multiplier: mines.multiplier(s.mines, gems),
    nextMultiplier: gems < mines.maxGems(s.mines) ? mines.multiplier(s.mines, gems + 1) : null,
    payout: roundMoney(s.bet * mines.multiplier(s.mines, gems)),
    nonce: s.nonce,
    result: s.phase === 'done' ? { ...s.result, positions: s.positions } : null,
  }
}

function minesFinish(s, win, hit) {
  const gems = s.revealed.length
  const mult = win ? mines.multiplier(s.mines, gems) : 0
  const payout = roundMoney(s.bet * mult)
  settle({
    run: s.run,
    game: 'mines',
    staked: s.bet,
    returned: payout,
    detail: win ? `${plural(gems, 'gem')} · ${plural(s.mines, 'mine')} (${mult}×)` : `Mine on pick ${gems + 1} · ${plural(s.mines, 'mine')}`,
  })
  return { ...s, phase: 'done', result: { win, hit, multiplier: mult, payout } }
}

function minesPick(s, tile) {
  if (!Number.isInteger(tile) || tile < 0 || tile > 24) throw new Error('Pick a tile from 0 to 24.')
  if (s.revealed.includes(tile)) throw new Error('That tile is already open.')
  if (s.positions.includes(tile)) return minesFinish(s, false, tile)
  const next = { ...s, revealed: [...s.revealed, tile] }
  return next.revealed.length === mines.maxGems(s.mines) ? minesFinish(next, true, null) : next
}

async function minesBegin(amount, count) {
  if (!(count >= 1 && count <= 24)) throw new Error('Pick 1 to 24 mines.')
  if (crashInPlay() || load('mines')?.phase === 'playing' || load('chicken')?.phase === 'playing') throw new Error('Finish the current round first.')
  const { bet, run } = stake(amount)
  const { floats, nonce } = await nextFloats(24)
  return { phase: 'playing', bet, mines: count, revealed: [], run, nonce, positions: mines.placeMines(floats, count) }
}

export const minesApi = {
  async state() {
    return BACKEND_ENABLED ? backend.minesState() : minesView(load('mines'))
  },
  async start({ amount, mines: count }) {
    if (BACKEND_ENABLED) return remote(() => backend.minesStart({ amount, mines: count }))
    const s = await minesBegin(amount, count)
    save('mines', s)
    return minesView(s)
  },
  async reveal(tile) {
    if (BACKEND_ENABLED) return remote(() => backend.minesReveal(tile))
    const s = load('mines')
    if (s?.phase !== 'playing') throw new Error('Start a round first.')
    const next = minesPick(s, tile)
    save('mines', next)
    return minesView(next)
  },
  async cashout() {
    if (BACKEND_ENABLED) return remote(() => backend.minesCashout())
    const s = load('mines')
    if (s?.phase !== 'playing') throw new Error('There is no round to cash out.')
    if (!s.revealed.length) throw new Error('Open at least one tile first.')
    const next = minesFinish(s, true, null)
    save('mines', next)
    return minesView(next)
  },
  /** Opens the tiles in order and cashes out if they are all safe. */
  async auto({ amount, mines: count, tiles }) {
    if (BACKEND_ENABLED) return remote(() => backend.minesAuto({ amount, mines: count, tiles }))
    if (!tiles.length || tiles.length > 25 - count || new Set(tiles).size !== tiles.length || !isTileList(tiles)) {
      throw new Error(`Pick between 1 and ${25 - count} different tiles from 0 to 24.`)
    }
    let s = await minesBegin(amount, count)
    for (const t of tiles) {
      s = minesPick(s, t)
      if (s.phase === 'done') break
    }
    if (s.phase === 'playing') s = minesFinish(s, true, null)
    save('mines', s)
    return minesView(s)
  },
}

// Chicken Cross -----------------------------------------------------------------------

export function chickenView(s) {
  if (!s) return { phase: 'idle' }
  const { lanes } = chicken.DIFFICULTIES[s.difficulty]
  return {
    phase: s.phase,
    bet: s.bet,
    difficulty: s.difficulty,
    lane: s.lane,
    lanes,
    multiplier: chicken.multiplier(s.difficulty, s.lane),
    nextMultiplier: s.lane < lanes ? chicken.multiplier(s.difficulty, s.lane + 1) : null,
    payout: roundMoney(s.bet * chicken.multiplier(s.difficulty, s.lane)),
    nonce: s.nonce,
    result: s.phase === 'done' ? s.result : null,
  }
}

function chickenFinish(s, win) {
  const mult = win ? chicken.multiplier(s.difficulty, s.lane) : 0
  const payout = roundMoney(s.bet * mult)
  const label = chicken.DIFFICULTIES[s.difficulty].label
  settle({
    run: s.run,
    game: 'chicken',
    staked: s.bet,
    returned: payout,
    detail: win ? `Lane ${s.lane} · ${label} (${mult}×)` : `Hit on lane ${s.lane + 1} · ${label}`,
  })
  return { ...s, phase: 'done', result: { win, lane: s.lane, hitLane: win ? null : s.lane + 1, multiplier: mult, payout, crashLane: s.crash } }
}

function chickenHop(s) {
  const next = s.lane + 1
  if (s.crash === next) return chickenFinish(s, false)
  const moved = { ...s, lane: next }
  return next >= chicken.DIFFICULTIES[s.difficulty].lanes ? chickenFinish(moved, true) : moved
}

async function chickenBegin(amount, difficulty) {
  if (!chicken.DIFFICULTIES[difficulty]) throw new Error('Pick Easy, Medium, Hard or Daredevil.')
  if (crashInPlay() || load('mines')?.phase === 'playing' || load('chicken')?.phase === 'playing') throw new Error('Finish the current round first.')
  const { bet, run } = stake(amount)
  const { floats, nonce } = await nextFloats(chicken.DIFFICULTIES[difficulty].lanes)
  return { phase: 'playing', bet, difficulty, lane: 0, run, nonce, crash: chicken.crashLane(floats, difficulty) }
}

export const chickenApi = {
  async state() {
    return BACKEND_ENABLED ? backend.chickenState() : chickenView(load('chicken'))
  },
  async start({ amount, difficulty }) {
    if (BACKEND_ENABLED) return remote(() => backend.chickenStart({ amount, difficulty }))
    const s = await chickenBegin(amount, difficulty)
    save('chicken', s)
    return chickenView(s)
  },
  async step() {
    if (BACKEND_ENABLED) return remote(() => backend.chickenStep())
    const s = load('chicken')
    if (s?.phase !== 'playing') throw new Error('Start a round first.')
    const next = chickenHop(s)
    save('chicken', next)
    return chickenView(next)
  },
  async cashout() {
    if (BACKEND_ENABLED) return remote(() => backend.chickenCashout())
    const s = load('chicken')
    if (s?.phase !== 'playing') throw new Error('There is no round to cash out.')
    if (!s.lane) throw new Error('Cross at least one lane first.')
    const next = chickenFinish(s, true)
    save('chicken', next)
    return chickenView(next)
  },
  /** Hops to the target lane and cashes out there, unless hit first. */
  async auto({ amount, difficulty, target }) {
    if (BACKEND_ENABLED) return remote(() => backend.chickenAuto({ amount, difficulty, target }))
    let s = await chickenBegin(amount, difficulty)
    while (s.phase === 'playing' && s.lane < target) s = chickenHop(s)
    if (s.phase === 'playing') s = chickenFinish(s, true)
    save('chicken', s)
    return chickenView(s)
  },
}
