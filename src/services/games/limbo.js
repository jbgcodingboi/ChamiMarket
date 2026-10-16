/**
 * Limbo and Crash. Backend mode: the server draws the result and pays
 * (supabase/schema.sql play_limbo, crash_*). Local mode: drawn here from the
 * player's seeds with the same formula, and a Crash round is kept in this
 * browser like a Mines round.
 */
import { formatMult, GROWTH, isWin, resultFromFloat, timeTo } from '../../games/limbo.js'
import { useAccountStore } from '../../store/accountStore.js'
import { debit, settle } from '../../store/gameStore.js'
import { roundMoney } from '../../utils/math.js'
import { isPlainObject, readJSON, writeJSON } from '../../utils/storage.js'
import * as backend from '../backend/api.js'
import { BACKEND_ENABLED } from '../backend/config.js'
import { localRoundOpen, nextFloats, roundKey, useFairStore } from './fairSeeds.js'

export const limboDetail = ({ result, target }) => `Result ${formatMult(result)} · target ${formatMult(target)}`

/** One Limbo bet. The caller records it with place()/finish() so the balance moves after the animation. */
export async function playLimbo({ amount, target }) {
  if (BACKEND_ENABLED) {
    const r = await backend.playLimbo({ amount, target })
    useFairStore.getState().used(r.nonce)
    return { result: Number(r.result), win: r.win, target: Number(r.target), payout: Number(r.payout), nonce: r.nonce, portfolio: r.portfolio }
  }
  const { floats, nonce } = await nextFloats(1)
  const result = resultFromFloat(floats[0])
  const win = isWin(result, target)
  // Rounded down to the cent, like the server.
  const payout = win ? Math.min(1e12, Math.floor((Math.round(amount * 100) * Math.round(target * 100)) / 100) / 100) : 0
  return { result, win, target, payout, nonce, portfolio: null }
}

// Crash ---------------------------------------------------------------------------

const isCrash = (s) => isPlainObject(s) && (s.phase === 'playing' || s.phase === 'done') && Number.isFinite(s.bet) && Number.isFinite(s.started)
const load = () => {
  const s = readJSON(roundKey('crash'), isCrash, null)
  if (s?.phase === 'playing' && s.run !== useAccountStore.getState().portfolio?.run) return null
  return s
}
const save = (s) => writeJSON(roundKey('crash'), s)

/** What the page sees: the crash point stays hidden until the round is over (the server does the same). */
function view(s) {
  if (!s) return { phase: 'idle' }
  return { phase: s.phase, bet: s.bet, auto: s.auto, elapsed: Date.now() - s.started, nonce: s.nonce, result: s.phase === 'done' ? s.result : null }
}

function finish(s, win, mult) {
  const payout = win ? roundMoney(s.bet * mult) : 0
  settle({
    run: s.run,
    game: 'crash',
    staked: s.bet,
    returned: payout,
    detail: win ? `Cashed out ${formatMult(mult)} · crashed at ${formatMult(s.crash)}` : `Crashed at ${formatMult(s.crash)}`,
  })
  return { ...s, phase: 'done', result: { win, cashout: win ? mult : null, crash: s.crash, payout } }
}

/** Same rules as the server's crash_check. */
function check(s, cashout) {
  if (s?.phase !== 'playing') return s
  const x = Math.exp(GROWTH * Math.max(0, Date.now() - s.started)) * 100
  const c = Math.round(s.crash * 100)
  const a = s.auto ? Math.round(s.auto * 100) : null
  if (a !== null && a <= c && x >= a) return finish(s, true, s.auto)
  if (x >= c) return finish(s, false, 0)
  if (cashout) return finish(s, true, Math.floor(x) / 100)
  return s
}

async function remote(call) {
  const res = await call()
  if (res.portfolio) useAccountStore.getState().adoptRemote(res.portfolio)
  if (res.round?.nonce !== undefined) useFairStore.getState().used(res.round.nonce)
  return res.round
}

export const crashApi = {
  async state() {
    if (BACKEND_ENABLED) return remote(() => backend.crashState())
    const s = load()
    const next = check(s, false)
    if (next !== s) save(next)
    return view(next)
  },
  async start({ amount, auto }) {
    if (BACKEND_ENABLED) return remote(() => backend.crashStart({ amount, auto }))
    const bet = roundMoney(amount)
    if (!(bet >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
    // A finished round still waiting to be settled is settled first.
    const prev = load()
    const settled = check(prev, false)
    if (settled !== prev) save(settled)
    if (localRoundOpen()) throw new Error('Finish the current round first.')
    const run = debit(bet)
    if (!run) throw new Error('Not enough chips for this bet.')
    const { floats, nonce } = await nextFloats(1)
    const crash = resultFromFloat(floats[0])
    const started = Date.now()
    const end = auto && auto <= crash ? auto : crash
    const s = { phase: 'playing', bet, run, nonce, crash, auto: auto || null, started, ends: started + Math.ceil(timeTo(end)) }
    save(s)
    return view(s)
  },
  async cashout() {
    if (BACKEND_ENABLED) return remote(() => backend.crashCashout())
    const s = load()
    if (!s) throw new Error('There is no round to cash out.')
    const next = check(s, true)
    save(next)
    return view(next)
  },
}
