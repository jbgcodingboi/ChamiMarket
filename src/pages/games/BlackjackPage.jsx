import { useEffect, useMemo, useRef, useState } from 'react'
import { ChipBurst, ChipRack, ChipStack } from '../../components/games/Chip.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import PlayingCard from '../../components/games/PlayingCard.jsx'
import { kbdClass, useHotkeys } from '../../components/games/roulette/useHotkeys.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import * as bj from '../../games/blackjack.js'
import { GAME_NAME } from '../../games/names.js'
import { useAccountStore } from '../../store/accountStore.js'
import { blackjackAct, blackjackDeal, blackjackState } from '../../services/backend/api.js'
import { BACKEND_ENABLED } from '../../services/backend/config.js'
import { debit, settle, useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { isPlainObject, readJSON, writeJSON } from '../../utils/storage.js'
import { formatCurrency } from '../../utils/format.js'
import { blackjackSounds } from '../../games/sounds/blackjack.js'
import './blackjack.css'

const CHIP_VALUES = [1, 5, 25, 100, 500, 1000]

const PHASES = new Set(['betting', 'insurance', 'player', 'done'])
const tableKey = (owner) => `games:${owner ?? 'guest'}:blackjack`
const isTable = (t) =>
  isPlainObject(t) &&
  isPlainObject(t.game) &&
  PHASES.has(t.game.phase) &&
  Array.isArray(t.game.shoe) &&
  Array.isArray(t.game.dealer) &&
  Array.isArray(t.game.hands) &&
  Number.isInteger(t.round) &&
  typeof t.settled === 'boolean'

const freshTable = () => ({ game: bj.initialState(), round: 0, settled: true, lastBet: 25 })

const OUTCOME = {
  blackjack: ['Natural 21!', 'bg-warn text-black'],
  win: ['Win', 'bg-yes text-black'],
  push: ['Push', 'bg-surface-3 text-fg'],
  lose: ['Lose', 'bg-no text-black'],
  bust: ['Bust', 'bg-no text-black'],
}
const HAND_TONE = { blackjack: 'bj-hand-blackjack', win: 'bj-hand-win', lose: 'bj-hand-lose', bust: 'bj-hand-lose', push: '' }
const DEAL_STEP = 170
const NARROW = '(max-width: 639px)'
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW)
    if (!mq) return undefined
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

function totalLabel(cards) {
  if (!cards.length) return ''
  if (bj.isBlackjack(cards)) return '21'
  const { total, soft } = bj.handValue(cards)
  return soft && total < 21 ? `${total - 10} / ${total}` : String(total)
}

/** Pill color for a hand total: gold on 21, red once bust. */
function totalTone(cards) {
  if (!cards.length || !cards.every((c) => c.rank)) return 'bg-black/45 text-white'
  const { total } = bj.handValue(cards)
  if (total > 21) return 'bg-no text-black'
  if (total === 21) return 'bg-warn text-black'
  return 'bg-black/45 text-white'
}

/** Deal order for the opening four cards: player, dealer, player, dealer. */
const dealDelay = (who, i, opening) => (opening && i < 2 ? (i * 2 + (who === 'dealer' ? 1 : 0)) * DEAL_STEP : 0)

function Hand({ cards, hiddenFrom = Infinity, label, active, bet, doubled, outcome, small, cardKey, who = 'player', opening = false }) {
  const tone = outcome ? HAND_TONE[outcome] : active ? 'bj-hand-active' : ''
  const visible = cards.slice(0, Math.min(cards.length, hiddenFrom))
  const bust = visible.length > 0 && visible.every((c) => c.rank) && bj.handValue(visible).total > 21
  return (
    <div className={`bj-hand relative flex flex-col items-center gap-2 rounded-2xl px-2 pt-2 pb-1.5 ${tone}`}>
      <div className="flex items-end">
        {cards.map((card, i) => (
          <div key={cardKey(card, i)} className={i ? (small ? '-ml-9' : '-ml-11 sm:-ml-12') : ''}>
            <PlayingCard card={card} hidden={i >= hiddenFrom} delay={dealDelay(who, i, opening)} small={small} covered={i < cards.length - 1} />
          </div>
        ))}
      </div>
      <div className={`flex min-h-7 flex-wrap items-center justify-center gap-1.5 text-sm ${small ? 'max-w-[8.5rem]' : ''}`}>
        {label && (
          <span key={label} className={`bj-total rounded-full px-2.5 py-0.5 font-bold tabular shadow ${totalTone(visible)}`} aria-label={`Total ${label}`}>
            {label}
          </span>
        )}
        {bust && !outcome && <span className="rounded-full bg-no px-2 py-0.5 text-xs font-bold text-black">Bust</span>}
        {bet > 0 && (
          <span className="flex items-center gap-1 text-white/90">
            <ChipStack amount={bet} size={22} step={3} limit={doubled ? 6 : 3} />
            <span className="text-xs font-semibold tabular">{formatCurrency(bet)}</span>
            {doubled && <span className="rounded bg-white/15 px-1 text-[10px] font-bold text-warn">2×</span>}
          </span>
        )}
        {outcome && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold animate-chip-pop ${OUTCOME[outcome][1]}`}>{OUTCOME[outcome][0]}</span>}
      </div>
    </div>
  )
}

function Rules() {
  return (
    <>
      <p>Six decks, reshuffled when about a quarter of the shoe is left. Get closer to 21 than the dealer without going over.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>A natural 21 (an ace and a ten-value card as your first two cards) pays 3:2.</li>
        <li>A regular win pays 1:1. Ties push and your bet comes back.</li>
        <li>The dealer hits 16 or less and stands on every 17, soft 17 included.</li>
        <li>When the dealer shows an ace you can take insurance for half your bet. It pays 2:1 if the dealer has a natural 21.</li>
        <li>The dealer checks for a natural 21 under an ace or ten-value card before you act, so you only lose your original bet to one.</li>
        <li>Double down on any first two cards. Split pairs up to four hands. Split aces get one card each, and 21 after a split counts as 21, not a natural.</li>
      </ul>
      <p>
        Keyboard: <kbd>Space</kbd> deals, <kbd>H</kbd> hits, <kbd>S</kbd> stands, <kbd>D</kbd> doubles, <kbd>P</kbd> splits, <kbd>I</kbd> or <kbd>N</kbd> answers
        the insurance offer, <kbd>1</kbd>-<kbd>6</kbd> add chips and <kbd>Backspace</kbd> clears the bet.
      </p>
    </>
  )
}

// Backend mode: the server deals and keeps the shoe; this is the empty table shown while it loads.
const remoteTable = () => ({
  game: { phase: 'betting', dealer: [], hands: [], active: 0, insurance: 0, result: null, shoeLeft: 1 },
  round: 0,
  settled: true,
  lastBet: 25,
})

function Table({ owner }) {
  const remote = BACKEND_ENABLED
  const balance = useChips()
  const run = useAccountStore((s) => s.portfolio?.run)
  const [table, setTable] = useState(() => (remote ? remoteTable() : (readJSON(tableKey(owner), isTable, null) ?? freshTable())))
  const [working, setWorking] = useState(false)
  // The server's portfolio after a finished hand, applied once the dealer's cards are turned over.
  const heldPortfolio = useRef(null)
  const [bet, setBet] = useState(() => Math.min(table.lastBet ?? 25, Math.max(balance, 0)))
  const [reveal, setReveal] = useState(() => (table.settled ? Infinity : 1))
  // A balance reset ends the run, so a hand dealt before it is void.
  const voided = !table.settled && table.run !== undefined && table.run !== run
  const g = useMemo(() => (voided ? { ...table.game, phase: 'betting', dealer: [], hands: [], result: null } : table.game), [voided, table.game])
  const settled = voided || table.settled
  const narrow = useNarrow()
  // When the last deal went out, so the dealer waits for the cards to land before turning the hole card.
  const dealtAt = useRef(0)
  const [burst, setBurst] = useState(null)
  // True while the opening four cards are still flying out of the shoe.
  const [dealing, setDealing] = useState(false)

  /** Sound and confetti for a finished hand: a big burst for blackjack, a small one for a doubled or multi-hand win. */
  const celebrate = (game, round) => {
    const result = game.result
    if (!result) return
    const won = roundMoney(result.returned - result.staked)
    const outcomes = game.hands.map((h) => h.outcome)
    if (outcomes.includes('blackjack') && won > 0) {
      blackjackSounds.blackjack()
      setBurst({ key: round, big: true })
    } else if (won > 0) {
      blackjackSounds.win()
      const wins = game.hands.filter((h) => h.outcome === 'win')
      if (wins.length > 1 || wins.some((h) => h.doubled)) setBurst({ key: round, big: false })
    } else if (won === 0) blackjackSounds.push()
    else if (outcomes.every((o) => o === 'bust')) blackjackSounds.bust()
    else blackjackSounds.lose()
  }

  useEffect(() => {
    if (!dealing) return undefined
    const timer = setTimeout(() => setDealing(false), reducedMotion() ? 0 : 3 * DEAL_STEP + 400)
    return () => clearTimeout(timer)
  }, [dealing, table.round])

  useEffect(() => {
    if (!remote) writeJSON(tableKey(owner), table)
  }, [owner, table, remote])

  // Backend mode: pick up the hand where the server left it (also after a balance reset).
  useEffect(() => {
    if (!remote) return undefined
    let live = true
    blackjackState()
      .then((view) => live && setTable((t) => ({ ...t, game: view, settled: true, run })))
      .catch((err) => toast({ tone: 'error', title: 'Could not load the table', description: err.message }))
    return () => {
      live = false
    }
  }, [remote, run])

  // Backend mode: leaving while the dealer's cards turn over still shows the server's settled balance.
  useEffect(
    () => () => {
      if (heldPortfolio.current) useAccountStore.getState().adoptRemote(heldPortfolio.current)
      heldPortfolio.current = null
    },
    [],
  )

  // When a round ends, turn the dealer's cards over one at a time, then pay out.
  useEffect(() => {
    if (g.phase !== 'done' || settled) return undefined
    const cards = g.dealer.length
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let shown = 1
    let timer
    const payOut = () => {
      celebrate(g, table.round)
      if (remote) {
        useAccountStore.getState().adoptRemote(heldPortfolio.current)
        heldPortfolio.current = null
        setTable((t) => ({ ...t, settled: true }))
        return
      }
      const { result, hands } = g
      const outcomes = hands.map((h) => OUTCOME[h.outcome][0].replace('!', '')).join(', ')
      settle({ run: table.run, game: 'blackjack', staked: result.staked, returned: result.returned, detail: `${outcomes} vs dealer ${bj.isBlackjack(g.dealer) ? 'natural 21' : bj.handValue(g.dealer).total}` })
      setTable((t) => ({ ...t, settled: true }))
    }
    const tick = () => {
      shown += 1
      setReveal(shown)
      if (!reduce) blackjackSounds.flip()
      timer = shown >= cards ? setTimeout(payOut, reduce ? 0 : 450) : setTimeout(tick, reduce ? 60 : 650)
    }
    // A hand that ends on the deal (a blackjack) waits for the opening cards to land first.
    const landing = dealtAt.current + 4 * DEAL_STEP + 450 - Date.now()
    timer = setTimeout(tick, reduce ? 0 : Math.max(350, landing))
    return () => clearTimeout(timer)
  }, [g, settled, table.run, table.round, remote])

  const betting = g.phase === 'betting' || (g.phase === 'done' && settled)
  const busy = g.phase === 'done' && !settled

  const update = (game) => setTable((t) => ({ ...t, game }))
  const pay = (amount, what) => {
    if (debit(amount)) return true
    toast({ tone: 'error', title: 'Not enough chips', description: `${what} needs ${formatCurrency(amount)}.` })
    return false
  }

  /** Backend mode: sends a move to the server and shows the table it returns. */
  const play = async (call, extra = {}) => {
    if (working) return
    setWorking(true)
    try {
      const res = await call()
      if (res.table.phase === 'done') heldPortfolio.current = res.portfolio
      else useAccountStore.getState().adoptRemote(res.portfolio)
      setTable((t) => ({ ...t, ...extra, game: res.table, settled: false }))
    } catch (err) {
      toast({ tone: 'error', title: 'Move not accepted', description: err.message })
    } finally {
      setWorking(false)
    }
  }

  const startRound = () => {
    if (!(bet >= 1)) return toast({ tone: 'error', title: 'Place a bet first' })
    if (remote) {
      if (bet > balance) return toast({ tone: 'error', title: 'Not enough chips', description: `This bet needs ${formatCurrency(bet)}.` })
      setReveal(1)
      dealtAt.current = Date.now()
      setDealing(true)
      return play(() => blackjackDeal(bet), { round: table.round + 1, lastBet: bet, run })
    }
    if (!pay(bet, 'This bet')) return
    setReveal(1)
    dealtAt.current = Date.now()
    setDealing(true)
    setTable((t) => ({ game: bj.deal(t.game, bet), round: t.round + 1, settled: false, lastBet: bet, run }))
  }

  const addChip = (v) => {
    const next = roundMoney(bet + v)
    if (next > balance) return toast({ tone: 'error', title: 'Not enough chips', description: `Your balance is ${formatCurrency(balance)}.` })
    blackjackSounds.chip()
    setBet(next)
  }

  const insure = (take) => {
    if (remote) return play(() => blackjackAct(take ? 'insurance' : 'no_insurance'))
    if (take && !pay(g.hands[0].bet / 2, 'Insurance')) return
    update(bj.insurance(g, take))
  }
  const doubleDown = () => (remote ? play(() => blackjackAct('double')) : pay(bj.cost(g, 'double'), 'Doubling') && update(bj.double(g)))
  const splitHand = () => (remote ? play(() => blackjackAct('split')) : pay(bj.cost(g, 'split'), 'Splitting') && update(bj.split(g)))
  const hit = () => (remote ? play(() => blackjackAct('hit')) : update(bj.hit(g)))
  const stand = () => (remote ? play(() => blackjackAct('stand')) : update(bj.stand(g)))
  const activeBet = g.hands[g.active]?.bet ?? 0
  const canDouble = (remote ? Boolean(g.canDouble) : bj.canDouble(g)) && balance >= activeBet && !working
  const canSplit = (remote ? Boolean(g.canSplit) : bj.canSplit(g)) && balance >= activeBet && !working

  const dealerHiddenFrom = g.phase === 'player' || g.phase === 'insurance' ? 1 : settled ? Infinity : reveal
  const dealerShown = g.dealer.slice(0, g.phase === 'done' && !settled ? Math.max(reveal, 2) : g.dealer.length)
  const visibleDealer = dealerShown.slice(0, Math.min(dealerShown.length, dealerHiddenFrom))
  const net = g.result ? roundMoney(g.result.returned - g.result.staked) : 0
  const playerCanAct = g.phase === 'player'
  const shoeLeft = remote ? (g.shoeLeft ?? 1) : g.shoe.length / (bj.DECKS * 52)

  const canHit = playerCanAct && !busy && !working && !dealing
  const opening = g.hands.length === 1 && !g.hands[0]?.fromSplit
  const roundKey = table.round
  const insuranceCost = g.phase === 'insurance' ? g.hands[0].bet / 2 : 0

  // Card sounds: one per card that lands, staggered like the deal itself.
  const cardCount = g.hands.reduce((a, h) => a + h.cards.length, 0) + dealerShown.length
  const heard = useRef({ round: roundKey, count: cardCount })
  useEffect(() => {
    const prev = heard.current
    heard.current = { round: roundKey, count: cardCount }
    if (reducedMotion()) return
    if (prev.round !== roundKey) {
      for (let i = 0; i < Math.min(cardCount, 4); i++) blackjackSounds.card((i * DEAL_STEP) / 1000 + 0.12)
    } else if (cardCount > prev.count) {
      for (let i = 0; i < cardCount - prev.count; i++) blackjackSounds.card(i * 0.09)
    }
  }, [roundKey, cardCount])

  const clearBet = () => {
    if (!bet) return
    blackjackSounds.chip()
    setBet(0)
  }
  const halfBet = () => {
    if (bet < 2) return
    blackjackSounds.chip()
    setBet(Math.max(1, Math.floor(bet / 2)))
  }

  useHotkeys({
    ' ': () => (betting && bet && bet <= balance && !working ? startRound() : false),
    h: () => canHit && hit(),
    s: () => canHit && stand(),
    d: () => (canDouble && canHit ? doubleDown() : betting && bet ? addChip(bet) : undefined),
    p: () => canSplit && canHit && splitHand(),
    i: () => g.phase === 'insurance' && !dealing && !working && balance >= insuranceCost && insure(true),
    n: () => g.phase === 'insurance' && !dealing && !working && insure(false),
    backspace: () => betting && clearBet(),
    ...Object.fromEntries(CHIP_VALUES.map((v, i) => [String(i + 1), () => betting && !working && addChip(v)])),
  })

  const outcomeText = (() => {
    if (!(g.phase === 'done' && settled && g.result)) return null
    const natural = g.hands.some((h) => h.outcome === 'blackjack')
    if (net > 0) return { title: natural ? 'Natural 21!' : 'You win', amount: `+${formatCurrency(net)}`, tone: natural ? 'text-warn' : 'text-yes' }
    if (net < 0) {
      const allBust = g.hands.every((h) => h.outcome === 'bust')
      return { title: allBust ? 'Bust' : g.result.dealerBlackjack ? 'Dealer natural 21' : 'Dealer wins', amount: `−${formatCurrency(-net)}`, tone: 'text-no' }
    }
    return { title: 'Push', amount: 'Bet returned', tone: 'text-white' }
  })()
  const dealerBust = visibleDealer.length > 1 && visibleDealer.every((c) => c.rank) && bj.handValue(visibleDealer).total > 21
  let status = null
  if (dealing) status = 'Dealing'
  else if (busy) status = 'Dealer plays'
  else if (playerCanAct) status = g.hands.length > 1 ? `Hand ${g.active + 1} of ${g.hands.length}` : 'Your move'

  return (
    <>
      <section className="felt bj-table relative overflow-hidden rounded-3xl border-[6px] border-[#4a2c14] p-3 sm:p-6" aria-label="Card table">
        <div className="bj-arc" aria-hidden="true" />
        <ChipBurst burst={burst} />
        <div className="relative flex items-start justify-between gap-3 text-[11px] text-white/70">
          <span className="rounded-full bg-black/30 px-2.5 py-1 font-semibold tracking-wider uppercase">Dealer</span>
          <span className="flex items-center gap-2 rounded-full bg-black/30 px-2.5 py-1" title="Cards left in the shoe">
            Shoe
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-black/50 sm:w-16">
              <span className="block h-full rounded-full bg-white/70 transition-[width] duration-500" style={{ width: `${Math.round(shoeLeft * 100)}%` }} />
            </span>
          </span>
        </div>
        <div className="relative flex min-h-[10.5rem] items-start justify-center sm:min-h-[12.5rem]">
          {g.dealer.length > 0 && (
            <div className="relative">
              <Hand cards={dealerShown} hiddenFrom={dealerHiddenFrom} label={dealing ? '' : totalLabel(visibleDealer)} cardKey={(_, i) => `${roundKey}-d${i}`} who="dealer" opening />
              {dealerBust && (
                <span className="absolute top-1 -right-2 rounded-full bg-no px-2 py-0.5 text-xs font-bold text-black shadow animate-chip-pop sm:-right-6">Dealer bust</span>
              )}
            </div>
          )}
        </div>

        <div className="pointer-events-none relative my-1 text-center text-[10px] font-semibold tracking-[0.2em] text-warn/80 uppercase sm:my-2 sm:text-[11px]">
          Natural 21 pays 3 to 2
          <span className="block text-[9px] font-medium tracking-[0.15em] text-white/50 sm:text-[10px]">Dealer stands on all 17s · Insurance pays 2 to 1</span>
        </div>

        <div className="relative flex min-h-[10.5rem] flex-wrap items-start justify-center gap-2 sm:min-h-[13rem] sm:gap-3">
          {g.hands.map((h, i) => (
            <Hand
              key={i}
              cards={h.cards}
              label={dealing ? '' : totalLabel(h.cards)}
              bet={h.bet}
              doubled={h.doubled}
              active={playerCanAct && g.hands.length > 1 && i === g.active}
              outcome={settled && g.phase === 'done' ? h.outcome : null}
              small={g.hands.length > 2 || (narrow && g.hands.length > 1)}
              cardKey={(card, j) => `${roundKey}-${card.id}-${j}`}
              opening={opening}
            />
          ))}
          {!g.hands.length && (
            <div className="flex flex-col items-center gap-2 self-center">
              <div className={`bj-spot flex size-24 items-center justify-center rounded-full ${bet ? 'bj-spot-live' : ''}`}>
                {bet > 0 ? (
                  <span key={bet} className="bj-stack">
                    <ChipStack amount={bet} size={40} />
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">Bet</span>
                )}
              </div>
              <p className="text-sm text-white/70">{bet ? `${formatCurrency(bet)} ready. Deal when you are.` : 'Add chips, then deal.'}</p>
            </div>
          )}
        </div>

        <div className="relative mt-2 flex min-h-14 flex-wrap items-center justify-center gap-2 text-center" aria-live="polite">
          {g.phase === 'insurance' && !dealing && (
            <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-black/55 p-2 pl-4 backdrop-blur-sm animate-scale-in">
              <span className="text-sm text-white">Dealer shows an ace. Insurance for {formatCurrency(insuranceCost)}?</span>
              <button type="button" className="btn btn-primary px-3" onClick={() => insure(true)} disabled={balance < insuranceCost || working}>
                Take insurance
                <kbd className={kbdClass}>I</kbd>
              </button>
              <button type="button" className="btn btn-ghost border-white/20 bg-white/10 px-3 text-white" onClick={() => insure(false)} disabled={working}>
                No thanks
                <kbd className={kbdClass}>N</kbd>
              </button>
            </div>
          )}
          {outcomeText && (
            <div key={roundKey} className={`bj-banner inline-flex flex-col items-center rounded-2xl bg-black/55 px-6 py-2 backdrop-blur-sm ${net > 0 ? 'bj-banner-win' : ''}`}>
              <span className={`text-xs font-bold tracking-[0.18em] uppercase ${outcomeText.tone}`}>{outcomeText.title}</span>
              <span className={`font-extrabold tabular ${net > 0 ? 'text-2xl sm:text-3xl' : 'text-xl'} ${outcomeText.tone}`}>{outcomeText.amount}</span>
              {g.result.dealerBlackjack && g.result.insuranceBack > 0 && (
                <span className="text-xs text-white/70">Insurance paid {formatCurrency(g.result.insuranceBack)}</span>
              )}
            </div>
          )}
          {!outcomeText && g.phase !== 'insurance' && status && (
            <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-white/80">{status}</span>
          )}
          {g.reshuffled && g.phase !== 'done' && g.phase !== 'insurance' && <span className="text-xs text-white/60">The shoe was reshuffled.</span>}
        </div>
      </section>

      <section className="card p-3 sm:p-4" aria-label="Controls">
        {betting ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <ChipRack onAdd={addChip} max={Math.max(0, balance - bet)} disabled={working} />
              <div className="ml-auto flex items-center gap-3 text-right">
                {bet > 0 && <ChipStack amount={bet} size={30} step={3} limit={4} />}
                <div>
                  <p className="text-xs text-muted">Bet</p>
                  <p key={bet} className={`text-xl font-bold tabular ${bet ? 'animate-chip-pop' : 'text-subtle'}`}>
                    {formatCurrency(bet)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-ghost px-3 sm:px-4" onClick={clearBet} disabled={!bet}>
                Clear
              </button>
              <button type="button" className="btn btn-ghost px-3 sm:px-4" onClick={halfBet} disabled={bet < 2} aria-label="Halve the bet">
                ½
              </button>
              <button type="button" className="btn btn-ghost px-3 sm:px-4" onClick={() => addChip(bet)} disabled={!bet} aria-label="Double the bet">
                2×
              </button>
              <button
                type="button"
                className="btn btn-primary ml-auto h-12 min-w-36 flex-1 px-6 text-base shadow-[0_8px_24px_-8px_rgb(181_42_44/0.8)] sm:flex-none"
                onClick={startRound}
                disabled={!bet || bet > balance || working}
              >
                {working ? 'Dealing…' : bet ? `Deal ${formatCurrency(bet)}` : 'Deal'}
                {!working && <kbd className={kbdClass}>Space</kbd>}
              </button>
            </div>
            <p className="text-xs text-subtle">
              {bet > balance ? 'This bet is more than your balance. Clear it or halve it.' : 'Tap chips to build your bet. The same bet stays up for the next hand.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span className="text-muted">
                {busy ? 'The dealer plays out the hand.' : g.phase === 'insurance' ? 'Answer the insurance offer first.' : 'Hit, stand, double or split.'}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs text-muted">In play</span>
                <span className="font-bold tabular">{formatCurrency(g.hands.reduce((a, h) => a + h.bet, 0) + (g.insurance ?? 0))}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" className="btn btn-primary h-12 text-base" disabled={!canHit} onClick={hit}>
                Hit
                <kbd className={kbdClass}>H</kbd>
              </button>
              <button type="button" className="btn btn-ghost h-12 text-base" disabled={!canHit} onClick={stand}>
                Stand
                <kbd className={kbdClass}>S</kbd>
              </button>
              <button type="button" className="btn btn-ghost h-12 text-base" disabled={!canDouble || !canHit} onClick={doubleDown}>
                Double
                <kbd className={kbdClass}>D</kbd>
              </button>
              <button type="button" className="btn btn-ghost h-12 text-base" disabled={!canSplit || !canHit} onClick={splitHand}>
                Split
                <kbd className={kbdClass}>P</kbd>
              </button>
            </div>
            <p className="min-h-4 text-xs text-subtle">
              {playerCanAct && g.hands[g.active] ? `${totalLabel(g.hands[g.active].cards)} against the dealer's ${totalLabel(g.dealer.slice(0, 1))}.` : ''}
            </p>
          </div>
        )}
      </section>
    </>
  )
}

export default function BlackjackPage() {
  useDocumentTitle('Games')
  const owner = useAccountStore((s) => s.user?.id ?? null)
  return (
    <GameShell game="blackjack" title={GAME_NAME.blackjack} subtitle="Six decks. A natural 21 pays 3:2, dealer stands on soft 17." rules={<Rules />}>
      <Table key={owner ?? 'guest'} owner={owner} />
    </GameShell>
  )
}
