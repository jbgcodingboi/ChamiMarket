/**
 * Boneyard: a high-volatility western ways slot on a 2-3-3-3-1 grid.
 *
 * Every spin is drawn from provably fair floats, FLOATS_PER_SPIN per spin, so
 * the server (supabase/schema.sql boneyard_round) and this file produce the
 * same round from the same seeds. All money math is in integer "units" of a
 * hundredth of the bet, so both sides agree to the cent.
 *
 * Wins pay left to right on adjacent reels (3 or more) for every way: the
 * ways for a symbol are the product of how many times it shows on each reel.
 *
 * - Nudge Wilds (reels 2 to 4) are 3 high. When part of one lands it nudges
 *   to fill the reel, and every step of the nudge adds 1 to its multiplier.
 *   Nudge multipliers on a winning way add together.
 * - Split Wilds (reel 5) count as 2 and split one row of the reels to their
 *   left: split symbols count twice, and a split Nudge Wild doubles its
 *   multiplier.
 * - R.I.P. rule: in the base game a total win below the bet pays nothing.
 * - 3 or more scatters start High Noon: 8 free spins with a global multiplier
 *   that grows by 1 for every wild that lands and never resets.
 * - 3 or more scatters with a coffin on reel 5 start Last Rites: 10 free spins
 *   that also turn one character into wilds every spin and give another a
 *   random 5× to 999× multiplier.
 * - A round never pays more than 300,000× the bet.
 */
export const ROWS = [2, 3, 3, 3, 1]
export const FLOATS_PER_SPIN = 22
export const HIGH_NOON_SPINS = 8
export const LAST_RITES_SPINS = 10
export const MAX_SPINS = 1 + LAST_RITES_SPINS
export const FLOAT_COUNT = MAX_SPINS * FLOATS_PER_SPIN
export const CAP_X = 300000
const CAP_UNITS = CAP_X * 100

export const LOWS = ['jack', 'queen', 'king', 'ace']
export const CHARACTERS = ['gambler', 'undertaker', 'outlaw', 'sheriff']
export const PAYING = [...LOWS, ...CHARACTERS]

/** Pay per way for 3, 4 and 5 of a kind, in hundredths of the bet. */
export const PAY = {
  jack: [4, 10, 25],
  queen: [4, 12, 30],
  king: [5, 15, 40],
  ace: [7, 20, 50],
  gambler: [12, 40, 100],
  undertaker: [15, 50, 125],
  outlaw: [20, 60, 175],
  sheriff: [25, 100, 250],
}

const table = (pairs) => ({ symbols: pairs.map((p) => p[0]), weights: pairs.map((p) => p[1]), total: pairs.reduce((s, p) => s + p[1], 0) })

/** Symbol odds per cell: reel 1, reels 2 to 4, reel 5. */
export const REEL_1 = table([['jack', 14], ['queen', 14], ['king', 13], ['ace', 13], ['gambler', 8], ['undertaker', 7], ['outlaw', 6], ['sheriff', 5], ['scatter', 3]])
export const REEL_MID = table([['jack', 14], ['queen', 14], ['king', 13], ['ace', 13], ['gambler', 8], ['undertaker', 7], ['outlaw', 6], ['sheriff', 5], ['wild', 7], ['scatter', 4]])
export const REEL_5 = table([['jack', 10], ['queen', 10], ['king', 10], ['ace', 10], ['gambler', 7], ['undertaker', 6], ['outlaw', 5], ['sheriff', 4], ['split', 3], ['coffin', 2]])
/** Chance in thousandths that a Nudge Wild lands on each of reels 2 to 4. */
export const NUDGE_PER_MILLE = 40
/** Last Rites random multipliers. */
export const RANDOM_MULT = table([[5, 540], [10, 250], [25, 120], [50, 60], [100, 35], [250, 15], [500, 5], [999, 2]])

/** Weighted pick with one float. floor(f × total) is exact for these small totals, here and in Postgres. */
export function pick(f, t) {
  let r = Math.floor(f * t.total)
  for (let i = 0; i < t.weights.length; i++) {
    r -= t.weights[i]
    if (r < 0) return t.symbols[i]
  }
  return t.symbols[t.symbols.length - 1]
}

/**
 * One spin from floats[at .. at + FLOATS_PER_SPIN). `mode` is 'base',
 * 'high-noon' or 'last-rites'; `global` is the free spins multiplier so far.
 */
export function spin(floats, at, mode, global = 1) {
  const f = (i) => floats[at + i]
  const reels = [[pick(f(0), REEL_1), pick(f(1), REEL_1)]]
  const nudges = [null]
  for (let r = 1; r <= 3; r++) {
    const o = 2 + (r - 1) * 5
    if (Math.floor(f(o) * 1000) < NUDGE_PER_MILLE) {
      const visible = 1 + Math.floor(f(o + 1) * 3)
      const steps = 3 - visible
      nudges.push({ visible, steps, mult: 1 + steps })
      reels.push(['wild', 'wild', 'wild'])
    } else {
      nudges.push(null)
      reels.push([pick(f(o + 2), REEL_MID), pick(f(o + 3), REEL_MID), pick(f(o + 4), REEL_MID)])
    }
  }
  nudges.push(null)
  let cowboy = null
  let random = null
  if (mode === 'last-rites') {
    cowboy = CHARACTERS[Math.floor(f(19) * 4)]
    reels.push([cowboy])
    const others = CHARACTERS.filter((c) => c !== cowboy)
    random = { symbol: others[Math.floor(f(20) * 3)], value: pick(f(21), RANDOM_MULT) }
  } else {
    reels.push([pick(f(17), REEL_5)])
  }

  // A Split Wild splits one row of the reels to its left.
  const splitRow = reels[4][0] === 'split' ? Math.floor(f(18) * 3) : null
  const split = reels.map((cells, r) => cells.map((_, row) => r < 4 && row === splitRow))
  for (let r = 1; r <= 3; r++) if (nudges[r] && splitRow !== null) nudges[r].mult *= 2

  // Free spins: every wild that lands adds 1 to the global multiplier, and it sticks.
  let landed = 0
  if (mode !== 'base') {
    for (let r = 1; r <= 3; r++) landed += nudges[r] ? 1 : reels[r].filter((s) => s === 'wild').length
    if (reels[4][0] === 'split') landed += 1
  }
  const nextGlobal = mode === 'base' ? 1 : global + landed

  const isWildFor = (sym) => sym === 'wild' || sym === 'split' || (cowboy !== null && sym === cowboy)
  const wins = []
  let units = 0
  for (const s of PAYING) {
    if (s === cowboy) continue
    const counts = reels.map((cells, r) => {
      if (nudges[r]) return cells.length + (splitRow !== null && r < 4 && splitRow < cells.length ? 1 : 0)
      return cells.reduce((n, sym, row) => n + (sym === s || isWildFor(sym) ? (sym === 'split' ? 2 : split[r][row] ? 2 : 1) : 0), 0)
    })
    let k = 0
    while (k < 5 && counts[k] > 0) k++
    if (k < 3) continue
    let ways = 1
    let nudgeMult = 0
    for (let r = 0; r < k; r++) {
      ways *= counts[r]
      if (nudges[r]) nudgeMult += nudges[r].mult
    }
    const mult = (nudgeMult || 1) * (random && random.symbol === s ? random.value : 1)
    const win = PAY[s][k - 3] * ways * mult
    wins.push({ symbol: s, count: k, ways, mult, units: win })
    units += win
  }
  units *= nextGlobal
  let rip = false
  if (mode === 'base' && units > 0 && units < 100) {
    rip = true
    units = 0
  }
  const scatters = mode === 'base' ? reels.slice(0, 4).flat().filter((s) => s === 'scatter').length : 0
  const bonus = scatters >= 3 ? (reels[4][0] === 'coffin' ? 'last-rites' : 'high-noon') : null
  return { reels, nudges, splitRow, wins, units, rip, global: nextGlobal, cowboy, random, scatters, bonus }
}

/** A whole round: the base spin, then any free spins, stopping at the 300,000× cap. */
export function playRound(floats) {
  const spins = [spin(floats, 0, 'base')]
  let total = Math.min(CAP_UNITS, spins[0].units)
  const bonus = spins[0].bonus
  if (bonus && total < CAP_UNITS) {
    let global = 1
    const count = bonus === 'last-rites' ? LAST_RITES_SPINS : HIGH_NOON_SPINS
    for (let i = 1; i <= count; i++) {
      const s = spin(floats, i * FLOATS_PER_SPIN, bonus, global)
      global = s.global
      spins.push(s)
      total = Math.min(CAP_UNITS, total + s.units)
      if (total >= CAP_UNITS) break
    }
  }
  return { spins, bonus, units: total, multiplier: total / 100, capped: total >= CAP_UNITS }
}

export const SYMBOL_NAME = {
  jack: 'J',
  queen: 'Q',
  king: 'K',
  ace: 'A',
  gambler: 'Gambler',
  undertaker: 'Undertaker',
  outlaw: 'Outlaw',
  sheriff: 'Sheriff',
  wild: 'Wild',
  split: 'Split Wild',
  scatter: 'Scatter',
  coffin: 'Coffin',
}
