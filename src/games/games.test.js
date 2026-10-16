import { describe, expect, it } from 'vitest'
import { STARTING_CASH } from '../config.js'
import { useAccountStore } from '../store/accountStore.js'
import { debit, finish, flush, gamesOf, place, runGames, settle } from '../store/gameStore.js'
import { createPortfolio, resetPortfolio } from '../utils/portfolio.js'
import { canDouble, canSplit, deal, dealerShouldHit, double, handValue, hit, initialState, insurance, isBlackjack, split, stand } from './blackjack.js'
import { bucketOf, bucketProbability, dropPath, expectedReturn, MULTIPLIERS, RISKS, ROW_OPTIONS } from './plinko.js'
import { flightPlan, GRAVITY } from './plinkoPhysics.js'
import { randomInt, shuffle } from './random.js'
import { betReturn, colorOf, column, corner, dozen, outside, sixline, split as rsplit, straight, street, totalReturn, WHEEL_ORDER } from './roulette.js'

const c = (rank) => ({ rank, suit: '♠', id: rank + Math.random() })
/** A state whose shoe deals the given ranks in order (player, dealer, player, dealer, then hits). */
const rigged = (...ranks) => ({ ...initialState(), shoe: [...ranks.map(c), ...Array.from({ length: 300 }, () => c('2'))], cut: 0 })

describe('random', () => {
  it('stays in range and shuffles without losing cards', () => {
    for (let i = 0; i < 500; i++) {
      const v = randomInt(37)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(37)
    }
    const deck = Array.from({ length: 52 }, (_, i) => i)
    expect([...shuffle(deck)].sort((a, b) => a - b)).toEqual(deck)
  })
})

describe('blackjack hand values', () => {
  it('counts aces as 11 or 1', () => {
    expect(handValue([c('A'), c('6')])).toEqual({ total: 17, soft: true })
    expect(handValue([c('A'), c('6'), c('10')])).toEqual({ total: 17, soft: false })
    expect(handValue([c('A'), c('A'), c('9')])).toEqual({ total: 21, soft: true })
    expect(isBlackjack([c('A'), c('K')])).toBe(true)
    expect(isBlackjack([c('7'), c('7'), c('7')])).toBe(false)
  })
  it('dealer stands on soft 17 and hits 16', () => {
    expect(dealerShouldHit([c('A'), c('6')])).toBe(false)
    expect(dealerShouldHit([c('10'), c('7')])).toBe(false)
    expect(dealerShouldHit([c('10'), c('6')])).toBe(true)
    expect(dealerShouldHit([c('A'), c('5')])).toBe(true)
  })
})

describe('blackjack rounds and payouts', () => {
  it('pays blackjack 3:2', () => {
    const s = deal(rigged('A', '9', 'K', '7'), 100)
    expect(s.phase).toBe('done')
    expect(s.hands[0].outcome).toBe('blackjack')
    expect(s.result.returned).toBe(250)
  })
  it('pays a win 1:1 and the dealer stands on soft 17', () => {
    // Player 10+8 = 18; dealer A+6 = soft 17 stands.
    let s = deal(rigged('10', 'A', '8', '6'), 50)
    expect(s.phase).toBe('insurance')
    s = insurance(s, false)
    s = stand(s)
    expect(s.dealer).toHaveLength(2)
    expect(s.hands[0].outcome).toBe('win')
    expect(s.result.returned).toBe(100)
  })
  it('pays insurance 2:1 when the dealer has blackjack', () => {
    let s = deal(rigged('10', 'A', '9', 'K'), 100)
    s = insurance(s, true)
    expect(s.phase).toBe('done')
    expect(s.hands[0].outcome).toBe('lose')
    expect(s.result.insuranceBack).toBe(150) // 50 insurance + 2:1
    expect(s.result.returned).toBe(150)
    expect(s.result.staked).toBe(150)
  })
  it('pushes a tie and a blackjack against a dealer blackjack', () => {
    let s = deal(rigged('10', '10', '8', '8'), 20)
    s = stand(s)
    expect(s.hands[0].outcome).toBe('push')
    expect(s.result.returned).toBe(20)
    s = insurance(deal(rigged('A', 'A', 'K', 'K'), 20), false)
    expect(s.hands[0].outcome).toBe('push')
  })
  it('busts and loses the bet', () => {
    let s = deal(rigged('10', '10', '6', '7', 'K'), 20)
    s = hit(s)
    expect(s.hands[0].outcome).toBe('bust')
    expect(s.result.returned).toBe(0)
  })
  it('doubles: one card, twice the stake', () => {
    let s = deal(rigged('6', '10', '5', '7', 'K'), 25)
    expect(canDouble(s)).toBe(true)
    s = double(s) // 21 vs dealer 17
    expect(s.hands[0].cards).toHaveLength(3)
    expect(s.hands[0].bet).toBe(50)
    expect(s.result.returned).toBe(100)
  })
  it('splits pairs into separate hands; 21 after a split is not blackjack', () => {
    // Player 8,8 vs dealer 10,7. Hands: 8+A=19 stands, 8+3=11 doubles +10=21.
    let s = deal(rigged('8', '10', '8', '7', 'A', '3', '10'), 10)
    expect(canSplit(s)).toBe(true)
    s = split(s)
    expect(s.hands).toHaveLength(2)
    s = stand(s)
    s = double(s)
    expect(s.phase).toBe('done')
    expect(s.hands.map((h) => h.outcome)).toEqual(['win', 'win'])
    expect(s.result.returned).toBe(20 + 40)
    const aces = split(deal(rigged('A', '9', 'A', '7', 'K', 'Q'), 10))
    expect(aces.phase).toBe('done')
    expect(aces.hands.map((h) => h.cards.length)).toEqual([2, 2])
    expect(aces.hands.map((h) => h.outcome)).toEqual(['win', 'win']) // 21 pays 1:1, not 3:2
    expect(aces.result.returned).toBe(40)
  })
})

describe('roulette', () => {
  it('has a European single-zero wheel', () => {
    expect(WHEEL_ORDER).toHaveLength(37)
    expect(new Set(WHEEL_ORDER).size).toBe(37)
    expect(colorOf(0)).toBe('green')
    expect(colorOf(32)).toBe('red')
    expect(colorOf(15)).toBe('black')
    expect(outside.red.numbers).toHaveLength(18)
  })
  it('pays the standard odds', () => {
    const bet = (b, amount = 10) => ({ ...b, amount })
    expect(betReturn(bet(straight(17)), 17)).toBe(360) // 35:1
    expect(betReturn(bet(rsplit(17, 20)), 20)).toBe(180) // 17:1
    expect(betReturn(bet(street(5)), 17)).toBe(120) // 16-18, 11:1
    expect(betReturn(bet(corner(17)), 21)).toBe(90) // 17/18/20/21, 8:1
    expect(betReturn(bet(sixline(5)), 21)).toBe(60) // 16-21, 5:1
    expect(betReturn(bet(dozen(1)), 24)).toBe(30) // 2:1
    expect(betReturn(bet(column(2)), 36)).toBe(30) // 2:1
    expect(betReturn(bet(outside.red), 32)).toBe(20) // 1:1
    expect(betReturn(bet(outside.red), 0)).toBe(0)
    expect(betReturn(bet(outside.even), 0)).toBe(0) // zero loses even-money bets
  })
  it('has a 2.7% house edge on every bet type', () => {
    for (const b of [straight(7), rsplit(1, 2), street(0), corner(1), sixline(0), dozen(0), column(0), outside.black, outside.low]) {
      const stake = { ...b, amount: 1 }
      const avg = WHEEL_ORDER.reduce((sum, n) => sum + totalReturn([stake], n), 0) / 37
      expect(avg).toBeCloseTo(36 / 37, 10)
    }
  })
})

describe('plinko', () => {
  it('follows a binomial distribution and returns about 99%', () => {
    for (const rows of ROW_OPTIONS) {
      expect(MULTIPLIERS[rows].low).toHaveLength(rows + 1)
      const total = Array.from({ length: rows + 1 }, (_, k) => bucketProbability(rows, k)).reduce((a, b) => a + b, 0)
      expect(total).toBeCloseTo(1, 12)
      for (const risk of RISKS) {
        expect(expectedReturn(rows, risk)).toBeGreaterThan(0.985)
        expect(expectedReturn(rows, risk)).toBeLessThan(0.995)
      }
    }
  })
  it('maps a left/right path to a bucket', () => {
    const path = dropPath(16)
    expect(path).toHaveLength(16)
    expect(bucketOf([1, 0, 1, 1])).toBe(3)
    let edge = 0
    for (let i = 0; i < 4000; i++) if ([0, 8].includes(bucketOf(dropPath(8)))) edge++
    expect(edge / 4000).toBeLessThan(0.03) // expected 2/256 = 0.8%
  })
})

describe('plinko physics', () => {
  it('lands the ball in the bucket its path picks, hitting one pin per row', () => {
    for (let i = 0; i < 50; i++) {
      const path = dropPath(12)
      const plan = flightPlan(path)
      expect(plan.bucket).toBe(bucketOf(path))
      expect(plan.segments).toHaveLength(13)
      const last = plan.segments.at(-1)
      const x = last.x0 + last.vx * last.T
      expect(x).toBeCloseTo(plan.bucket - 6, 10) // bucket centers sit at k - rows / 2
      // Each hop lands on the next row's pin directly below the ball.
      for (const s of plan.segments.slice(0, -1)) {
        const xEnd = s.x0 + s.vx * s.T
        expect(xEnd).toBeCloseTo(s.hit.j - (s.hit.row + 2) / 2, 10)
        expect(s.vy).toBeLessThanOrEqual(0)
      }
      expect(plan.duration).toBeGreaterThan(1)
      expect(plan.duration).toBeLessThan(4)
      expect(GRAVITY).toBeGreaterThan(0)
    }
  })
})

describe('games and the portfolio', () => {
  const cash = () => useAccountStore.getState().portfolio.cash
  it('bets and pays out with portfolio cash, exactly once per round', () => {
    useAccountStore.setState({ user: { id: 'u_test', username: 'tester' }, portfolio: createPortfolio() })
    expect(cash()).toBe(STARTING_CASH)
    const id = place({ game: 'plinko', staked: 100, returned: 250, detail: '2.5×' })
    expect(cash()).toBe(STARTING_CASH - 100)
    expect(finish(id).net).toBe(150)
    expect(finish(id)).toBeNull()
    expect(cash()).toBe(STARTING_CASH + 150)
    place({ game: 'roulette', staked: 50, returned: 0, detail: '17 Red' })
    flush('roulette')
    const run = debit(20)
    expect(run).toBe(1)
    settle({ run, game: 'blackjack', staked: 20, returned: 40, detail: 'Win' })
    const p = useAccountStore.getState().portfolio
    expect(p.cash).toBe(STARTING_CASH + 120)
    expect(gamesOf(p).pending).toHaveLength(0)
    expect(gamesOf(p).stats.roulette).toMatchObject({ rounds: 1, wagered: 50, net: -50 })
    expect(runGames(p)).toEqual({ net: 120, rounds: 3 })
    expect(place({ game: 'plinko', staked: 1e9, returned: 0 })).toBeNull()
  })
  it('drops rounds from before a balance reset', () => {
    const id = place({ game: 'plinko', staked: 100, returned: 1000, detail: '10×' })
    const run = debit(10)
    const reset = resetPortfolio(useAccountStore.getState().portfolio)
    useAccountStore.setState({ portfolio: reset })
    expect(runGames(reset)).toEqual({ net: 0, rounds: 0 })
    expect(finish(id)).toBeNull()
    expect(settle({ run, game: 'blackjack', staked: 10, returned: 20 })).toBeNull()
    expect(cash()).toBe(reset.cash)
    expect(gamesOf(useAccountStore.getState().portfolio).pending).toHaveLength(0)
  })
  it('needs an account', () => {
    useAccountStore.setState({ user: null, portfolio: null })
    expect(debit(10)).toBeNull()
    expect(place({ game: 'plinko', staked: 10, returned: 0 })).toBeNull()
  })
})
