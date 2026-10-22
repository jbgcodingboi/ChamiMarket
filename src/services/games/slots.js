import { FLOAT_COUNT, playRound } from '../../games/slots.js'
import * as backend from '../backend/api.js'
import { BACKEND_ENABLED } from '../backend/config.js'
import { nextFloats, useFairStore } from './fairSeeds.js'

export function slotsDetail(round) {
  const parts = []
  if (round.freeSpins) parts.push(`${round.freeSpins} free spins`)
  parts.push(round.units > 0 ? `${(round.units / 100).toFixed(2)}×${round.capped ? ' (max win)' : ''}` : 'No win')
  return parts.join(' · ')
}

/**
 * One spin, free spins included. Backend mode: the server draws and pays
 * (supabase/schema.sql play_slots); local mode: drawn here from the player's
 * seeds. The caller records it with place()/finish() so the balance moves
 * after the reels stop.
 */
export async function spinSlots({ amount }) {
  if (BACKEND_ENABLED) {
    const r = await backend.playSlots({ amount })
    useFairStore.getState().used(r.nonce)
    return { round: r.round, payout: Number(r.payout), nonce: r.nonce, portfolio: r.portfolio }
  }
  const { floats, nonce } = await nextFloats(FLOAT_COUNT)
  const round = playRound(floats)
  // Rounded down to the cent, like the server.
  return { round, payout: Math.min(1e12, Math.floor((Math.round(amount * 100) * round.units) / 100) / 100), nonce, portfolio: null }
}
