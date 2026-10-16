import { FLOAT_COUNT, playRound } from '../../games/boneyard.js'
import * as backend from '../backend/api.js'
import { BACKEND_ENABLED } from '../backend/config.js'
import { nextFloats, useFairStore } from './fairSeeds.js'

const BONUS_NAME = { 'high-noon': 'High Noon free spins', 'last-rites': 'Last Rites free spins' }
export const bonusName = (b) => BONUS_NAME[b] ?? null

export function boneyardDetail(round) {
  const label = bonusName(round.bonus)
  if (round.units > 0) return [label, `${(round.units / 100).toFixed(2)}×${round.capped ? ' (max win)' : ''}`].filter(Boolean).join(' · ')
  if (round.spins[0].rip) return 'R.I.P.'
  return label ?? 'No win'
}

/**
 * One spin, free spins included. Backend mode: the server draws and pays
 * (supabase/schema.sql play_boneyard); local mode: drawn here from the
 * player's seeds. The caller records it with place()/finish() so the balance
 * moves after the reels stop.
 */
export async function spinBoneyard({ amount }) {
  if (BACKEND_ENABLED) {
    const r = await backend.playBoneyard({ amount })
    useFairStore.getState().used(r.nonce)
    return { round: r.round, payout: Number(r.payout), nonce: r.nonce, portfolio: r.portfolio }
  }
  const { floats, nonce } = await nextFloats(FLOAT_COUNT)
  const round = playRound(floats)
  // Rounded down to the cent, like the server.
  return { round, payout: Math.min(1e12, Math.floor((Math.round(amount * 100) * round.units) / 100) / 100), nonce, portfolio: null }
}
