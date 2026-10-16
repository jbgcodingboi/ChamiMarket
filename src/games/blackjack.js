/**
 * Blackjack engine (pure, immutable state).
 *
 * Rules: 6-deck shoe reshuffled at the cut card (75% dealt); the dealer
 * stands on all 17s, including soft 17; the dealer peeks for blackjack when
 * showing an ace or ten; blackjack pays 3:2, wins 1:1, insurance 2:1.
 * Double on any first two cards (also after a split, except split aces);
 * split pairs up to four hands; split aces get one card each, and 21 after a
 * split is not a blackjack.
 *
 * Money is tracked as stakes on the table: callers debit the wallet when a
 * bet, double, split or insurance is placed (see `cost`), and credit
 * `result.returned` when the round settles.
 */
import { randomInt, shuffle } from './random.js'

export const SUITS = ['♠', '♥', '♦', '♣']
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
export const DECKS = 6
const MAX_HANDS = 4

export function createShoe(decks = DECKS, rand = randomInt) {
  const cards = []
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit, id: `${d}${rank}${suit}` })
  return shuffle(cards, rand)
}

const rankValue = (rank) => (rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(rank) ? 10 : Number(rank))

/** Best total and whether it is soft (an ace counted as 11). */
export function handValue(cards) {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += rankValue(c.rank)
    if (c.rank === 'A') aces++
  }
  while (total > 21 && aces) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21
const isTen = (card) => rankValue(card.rank) === 10

/** Stands on 17 or more, soft or hard. */
export const dealerShouldHit = (cards) => handValue(cards).total < 17

const newHand = (cards, bet, fromSplit = false, splitAces = false) => ({
  cards,
  bet,
  fromSplit,
  splitAces,
  doubled: false,
  done: splitAces,
})

export function initialState(rand = randomInt) {
  const shoe = createShoe(DECKS, rand)
  return { phase: 'betting', shoe, cut: Math.floor(shoe.length * 0.25), dealer: [], hands: [], active: 0, insurance: 0, result: null }
}

function draw(state, rand) {
  let shoe = state.shoe
  if (!shoe.length) shoe = createShoe(DECKS, rand)
  return { card: shoe[0], shoe: shoe.slice(1) }
}

function drawInto(state, rand, target) {
  const { card, shoe } = draw(state, rand)
  if (target === 'dealer') return { ...state, shoe, dealer: [...state.dealer, card] }
  const hands = state.hands.map((h, i) => (i === target ? { ...h, cards: [...h.cards, card] } : h))
  return { ...state, shoe, hands }
}

/** Starts a round with a bet; reshuffles first if the cut card was reached. */
export function deal(state, bet, rand = randomInt) {
  let s = { ...state, dealer: [], hands: [newHand([], bet)], active: 0, insurance: 0, result: null, reshuffled: false }
  if (s.shoe.length <= s.cut) {
    const shoe = createShoe(DECKS, rand)
    s = { ...s, shoe, cut: Math.floor(shoe.length * 0.25), reshuffled: true }
  }
  s = drawInto(s, rand, 0)
  s = drawInto(s, rand, 'dealer')
  s = drawInto(s, rand, 0)
  s = drawInto(s, rand, 'dealer')
  if (s.dealer[0].rank === 'A') return { ...s, phase: 'insurance' }
  return afterPeek(s)
}

/** The dealer checks for blackjack (showing an ace or ten), then naturals settle at once. */
function afterPeek(s) {
  if (isTen(s.dealer[0]) || s.dealer[0].rank === 'A') {
    if (isBlackjack(s.dealer)) return settle(s)
  }
  if (isBlackjack(s.hands[0].cards)) return settle(s)
  return { ...s, phase: 'player' }
}

/** Answers the insurance offer (dealer shows an ace). Insurance costs half the bet. */
export function insurance(state, take) {
  if (state.phase !== 'insurance') return state
  return afterPeek({ ...state, insurance: take ? state.hands[0].bet / 2 : 0 })
}

const current = (s) => s.hands[s.active]

export function canDouble(s) {
  const h = current(s)
  return s.phase === 'player' && h && h.cards.length === 2 && !h.splitAces
}

export function canSplit(s) {
  const h = current(s)
  return (
    s.phase === 'player' &&
    h &&
    h.cards.length === 2 &&
    rankValue(h.cards[0].rank) === rankValue(h.cards[1].rank) &&
    s.hands.length < MAX_HANDS
  )
}

/** Extra stake a move needs (for checking and debiting the wallet). */
export function cost(s, move) {
  const h = current(s)
  if (move === 'double' || move === 'split') return h?.bet ?? 0
  return 0
}

function advance(s, rand) {
  let next = s
  let i = s.active
  while (i < next.hands.length && next.hands[i].done) i++
  if (i < next.hands.length) {
    // A split hand that has only one card gets its second card now.
    if (next.hands[i].cards.length === 1) {
      next = drawInto({ ...next, active: i }, rand, i)
      if (next.hands[i].splitAces || handValue(next.hands[i].cards).total === 21) {
        next = { ...next, hands: next.hands.map((h, j) => (j === i ? { ...h, done: true } : h)) }
        return advance({ ...next, active: i }, rand)
      }
    }
    return { ...next, active: i, phase: 'player' }
  }
  return dealerPlay({ ...next, active: next.hands.length - 1 }, rand)
}

const markDone = (s) => ({ ...s, hands: s.hands.map((h, i) => (i === s.active ? { ...h, done: true } : h)) })

export function hit(state, rand = randomInt) {
  if (state.phase !== 'player') return state
  let s = drawInto(state, rand, state.active)
  if (handValue(current(s).cards).total >= 21) s = markDone(s)
  return advance(s, rand)
}

export function stand(state, rand = randomInt) {
  if (state.phase !== 'player') return state
  return advance(markDone(state), rand)
}

export function double(state, rand = randomInt) {
  if (!canDouble(state)) return state
  let s = { ...state, hands: state.hands.map((h, i) => (i === state.active ? { ...h, bet: h.bet * 2, doubled: true } : h)) }
  s = drawInto(s, rand, s.active)
  return advance(markDone(s), rand)
}

export function split(state, rand = randomInt) {
  if (!canSplit(state)) return state
  const h = current(state)
  const aces = h.cards[0].rank === 'A'
  const first = newHand([h.cards[0]], h.bet, true, aces)
  const second = newHand([h.cards[1]], h.bet, true, aces)
  first.done = false
  second.done = false
  const hands = [...state.hands.slice(0, state.active), first, second, ...state.hands.slice(state.active + 1)]
  let s = drawInto({ ...state, hands }, rand, state.active)
  if (aces || handValue(s.hands[s.active].cards).total === 21) s = markDone(s)
  return advance(s, rand)
}

function dealerPlay(s, rand) {
  const live = s.hands.some((h) => handValue(h.cards).total <= 21)
  let next = s
  if (live) while (dealerShouldHit(next.dealer)) next = drawInto(next, rand, 'dealer')
  return settle(next)
}

/** Final result per hand and the total returned (stakes plus winnings). */
export function settle(s) {
  const dealer = handValue(s.dealer)
  const dealerBj = isBlackjack(s.dealer)
  let returned = 0
  const hands = s.hands.map((h) => {
    const v = handValue(h.cards)
    const natural = isBlackjack(h.cards) && !h.fromSplit
    let outcome
    if (natural && !dealerBj) outcome = 'blackjack'
    else if (natural && dealerBj) outcome = 'push'
    else if (dealerBj) outcome = 'lose'
    else if (v.total > 21) outcome = 'bust'
    else if (dealer.total > 21 || v.total > dealer.total) outcome = 'win'
    else if (v.total === dealer.total) outcome = 'push'
    else outcome = 'lose'
    const back = outcome === 'blackjack' ? h.bet * 2.5 : outcome === 'win' ? h.bet * 2 : outcome === 'push' ? h.bet : 0
    returned += back
    return { ...h, outcome, returned: back }
  })
  const insuranceBack = dealerBj && s.insurance ? s.insurance * 3 : 0
  returned += insuranceBack
  const staked = s.hands.reduce((a, h) => a + h.bet, 0) + s.insurance
  return { ...s, phase: 'done', hands, result: { returned, staked, insuranceBack, dealerBlackjack: dealerBj } }
}
