import { formatRoll, isWin, multiplier, rollFromFloat, winChance } from '../../games/dice.js'
import { roundMoney } from '../../utils/math.js'
import * as backend from '../backend/api.js'
import { BACKEND_ENABLED } from '../backend/config.js'
import { nextFloats, useFairStore } from './fairSeeds.js'

export const diceDetail = ({ roll, target, over, mult }) => `Rolled ${formatRoll(roll)} · ${over ? 'over' : 'under'} ${target.toFixed(2)} (${mult}×)`

/**
 * One roll. Backend mode: the server rolls and pays (portfolio included);
 * local mode: rolled here from the player's seeds. The caller records the
 * round with place()/finish() so the balance changes after the animation.
 */
export async function rollDice({ amount, target, over }) {
  if (BACKEND_ENABLED) {
    const r = await backend.playDice({ amount, target, over })
    useFairStore.getState().used(r.nonce)
    return { roll: r.roll, win: r.win, multiplier: Number(r.multiplier), payout: Number(r.payout), nonce: r.nonce, portfolio: r.portfolio }
  }
  const { floats, nonce } = await nextFloats(1)
  const roll = rollFromFloat(floats[0])
  const mult = multiplier(winChance(target, over))
  const win = isWin(roll, target, over)
  return { roll, win, multiplier: mult, payout: win ? roundMoney(amount * mult) : 0, nonce, portfolio: null }
}
