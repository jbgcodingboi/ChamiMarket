/**
 * European roulette (single zero, 37 pockets). Payouts are the standard
 * odds "to 1"; a winning bet returns its stake plus odds x stake.
 */
import { randomInt } from './random.js'

export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black')

export const ODDS = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  sixline: 5,
  dozen: 2,
  column: 2,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  low: 1,
  high: 1,
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const NUMBERS = range(1, 36)

/** Table layout: 12 columns of 3 (top row 3, 6, ... 36; bottom row 1, 4, ... 34). */
export const numberAt = (col, row) => col * 3 + (3 - row)

const key = (type, numbers) => `${type}:${[...numbers].sort((a, b) => a - b).join('-')}`

export function makeBet(type, numbers, label) {
  return { key: key(type, numbers), type, numbers: [...numbers].sort((a, b) => a - b), label }
}

export const straight = (n) => makeBet('straight', [n], `${n}`)
export const split = (a, b) => makeBet('split', [a, b], `Split ${Math.min(a, b)}/${Math.max(a, b)}`)
/** Street: the three numbers of one table column (e.g. 1-2-3). */
export const street = (col) => makeBet('street', [col * 3 + 1, col * 3 + 2, col * 3 + 3], `Street ${col * 3 + 1}–${col * 3 + 3}`)
/** Corner with a given bottom-left number n (n, n+1, n+3, n+4); n must not be in the top row. */
export const corner = (n) => makeBet('corner', [n, n + 1, n + 3, n + 4], `Corner ${n}/${n + 1}/${n + 3}/${n + 4}`)
/** Six line: two adjacent streets starting at table column col. */
export const sixline = (col) => makeBet('sixline', range(col * 3 + 1, col * 3 + 6), `Six line ${col * 3 + 1}–${col * 3 + 6}`)
export const dozen = (d) => makeBet('dozen', range(d * 12 + 1, d * 12 + 12), `${['1st', '2nd', '3rd'][d]} 12`)
/** Column 0 is 1, 4, ... 34; column 2 is 3, 6, ... 36. */
export const column = (c) => makeBet('column', NUMBERS.filter((n) => n % 3 === (c + 1) % 3), `Column ${c + 1}`)
export const outside = {
  red: makeBet('red', NUMBERS.filter((n) => colorOf(n) === 'red'), 'Red'),
  black: makeBet('black', NUMBERS.filter((n) => colorOf(n) === 'black'), 'Black'),
  odd: makeBet('odd', NUMBERS.filter((n) => n % 2), 'Odd'),
  even: makeBet('even', NUMBERS.filter((n) => n % 2 === 0), 'Even'),
  low: makeBet('low', range(1, 18), '1–18'),
  high: makeBet('high', range(19, 36), '19–36'),
}

/** Total returned (stake + winnings) for a bet with an amount, or 0 if it loses. */
export const betReturn = (bet, result) => (bet.numbers.includes(result) ? bet.amount * (ODDS[bet.type] + 1) : 0)

export const totalReturn = (bets, result) => bets.reduce((sum, b) => sum + betReturn(b, result), 0)

/** One spin: a uniformly random pocket. */
export const spin = (rand = randomInt) => WHEEL_ORDER[rand(37)]
