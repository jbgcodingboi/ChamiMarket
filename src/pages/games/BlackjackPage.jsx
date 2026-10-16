import { useEffect, useState } from 'react'
import { Chip, ChipSelector } from '../../components/games/Chip.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import PlayingCard from '../../components/games/PlayingCard.jsx'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import * as bj from '../../games/blackjack.js'
import { useGameStore } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { isPlainObject, readJSON, writeJSON } from '../../utils/storage.js'
import { formatCurrency } from '../../utils/format.js'

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
  blackjack: ['Blackjack!', 'bg-warn text-black'],
  win: ['Win', 'bg-yes text-black'],
  push: ['Push', 'bg-surface-3 text-fg'],
  lose: ['Lose', 'bg-no text-black'],
  bust: ['Bust', 'bg-no text-black'],
}

function totalLabel(cards) {
  if (!cards.length) return ''
  if (bj.isBlackjack(cards)) return '21'
  const { total, soft } = bj.handValue(cards)
  return soft && total < 21 ? `${total - 10} / ${total}` : String(total)
}

function Hand({ cards, hiddenFrom = Infinity, label, active, bet, outcome, small }) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-2xl p-2 transition ${active ? 'bg-white/10 ring-2 ring-warn/80' : ''}`}>
      <div className="flex min-h-28 items-end">
        {cards.map((card, i) => (
          <div key={card.id + i} className={i ? (small ? '-ml-9' : '-ml-12') : ''}>
            <PlayingCard card={card} hidden={i >= hiddenFrom} index={i} small={small} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        {label && <span className="rounded-full bg-black/40 px-2.5 py-0.5 font-semibold text-white tabular">{label}</span>}
        {bet > 0 && (
          <span className="flex items-center gap-1 text-white/90">
            <Chip amount={bet} size={22} />
            <span className="tabular">{formatCurrency(bet)}</span>
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
        <li>Blackjack (an ace and a ten-value card as your first two cards) pays 3:2.</li>
        <li>A regular win pays 1:1. Ties push and your bet comes back.</li>
        <li>The dealer hits 16 or less and stands on every 17, soft 17 included.</li>
        <li>When the dealer shows an ace you can take insurance for half your bet. It pays 2:1 if the dealer has blackjack.</li>
        <li>The dealer checks for blackjack under an ace or ten-value card before you act, so you only lose your original bet to a dealer blackjack.</li>
        <li>Double down on any first two cards. Split pairs up to four hands. Split aces get one card each, and 21 after a split counts as 21, not blackjack.</li>
      </ul>
    </>
  )
}

function Table({ owner }) {
  const balance = useGameStore((s) => s.wallet.balance)
  const debit = useGameStore((s) => s.debit)
  const settle = useGameStore((s) => s.settle)
  const [table, setTable] = useState(() => readJSON(tableKey(owner), isTable, null) ?? freshTable())
  const [bet, setBet] = useState(() => Math.min(table.lastBet ?? 25, Math.max(balance, 0)))
  const [chip, setChip] = useState(25)
  const [reveal, setReveal] = useState(() => (table.settled ? Infinity : 1))
  const g = table.game

  useEffect(() => {
    writeJSON(tableKey(owner), table)
  }, [owner, table])

  // When a round ends, turn the dealer's cards over one at a time, then pay out.
  useEffect(() => {
    if (g.phase !== 'done' || table.settled) return undefined
    const cards = g.dealer.length
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let shown = 1
    let timer
    const payOut = () => {
      const { result, hands } = g
      const outcomes = hands.map((h) => OUTCOME[h.outcome][0].replace('!', '')).join(', ')
      settle({ game: 'blackjack', staked: result.staked, returned: result.returned, detail: `${outcomes} vs dealer ${bj.isBlackjack(g.dealer) ? 'blackjack' : bj.handValue(g.dealer).total}` })
      setTable((t) => ({ ...t, settled: true }))
    }
    const tick = () => {
      shown += 1
      setReveal(shown)
      timer = shown >= cards ? setTimeout(payOut, reduce ? 0 : 450) : setTimeout(tick, reduce ? 60 : 650)
    }
    timer = setTimeout(tick, reduce ? 0 : 350)
    return () => clearTimeout(timer)
  }, [g, table.settled, settle])

  const betting = g.phase === 'betting' || (g.phase === 'done' && table.settled)
  const busy = g.phase === 'done' && !table.settled

  const update = (game) => setTable((t) => ({ ...t, game }))
  const pay = (amount, what) => {
    if (debit(amount)) return true
    toast({ tone: 'error', title: 'Not enough chips', description: `${what} needs ${formatCurrency(amount)}.` })
    return false
  }

  const startRound = () => {
    if (!(bet >= 1)) return toast({ tone: 'error', title: 'Place a bet first' })
    if (!pay(bet, 'This bet')) return
    setReveal(1)
    setTable((t) => ({ game: bj.deal(t.game, bet), round: t.round + 1, settled: false, lastBet: bet }))
  }

  const addChip = (v) => {
    const next = roundMoney(bet + v)
    if (next > balance) return toast({ tone: 'error', title: 'Not enough chips', description: `Your balance is ${formatCurrency(balance)}.` })
    setBet(next)
  }

  const insure = (take) => {
    if (take && !pay(g.hands[0].bet / 2, 'Insurance')) return
    update(bj.insurance(g, take))
  }
  const doubleDown = () => pay(bj.cost(g, 'double'), 'Doubling') && update(bj.double(g))
  const splitHand = () => pay(bj.cost(g, 'split'), 'Splitting') && update(bj.split(g))

  const dealerHiddenFrom = g.phase === 'player' || g.phase === 'insurance' ? 1 : table.settled ? Infinity : reveal
  const dealerShown = g.dealer.slice(0, g.phase === 'done' && !table.settled ? Math.max(reveal, 2) : g.dealer.length)
  const visibleDealer = dealerShown.slice(0, Math.min(dealerShown.length, dealerHiddenFrom))
  const net = g.result ? roundMoney(g.result.returned - g.result.staked) : 0
  const playerCanAct = g.phase === 'player'
  const shoeLeft = g.shoe.length / (bj.DECKS * 52)

  return (
    <>
      <section className="felt relative overflow-hidden rounded-3xl border-4 border-[#5b3a1e] p-4 shadow-2xl sm:p-6" aria-label="Blackjack table">
        <div className="flex items-start justify-between gap-3 text-[11px] text-white/60">
          <span>Dealer</span>
          <span className="flex items-center gap-2" title="Cards left in the shoe">
            Shoe
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-black/40">
              <span className="block h-full rounded-full bg-white/60" style={{ width: `${Math.round(shoeLeft * 100)}%` }} />
            </span>
          </span>
        </div>
        <div className="flex min-h-40 justify-center">
          {g.dealer.length > 0 && <Hand cards={dealerShown} hiddenFrom={dealerHiddenFrom} label={totalLabel(visibleDealer)} />}
        </div>

        <div className="pointer-events-none my-3 text-center text-[11px] font-semibold tracking-[0.2em] text-warn/80 uppercase">
          Blackjack pays 3 to 2
          <span className="block text-[10px] font-medium tracking-[0.15em] text-white/50">Dealer stands on all 17s · Insurance pays 2 to 1</span>
        </div>

        <div className="flex min-h-40 flex-wrap items-end justify-center gap-3">
          {g.hands.map((h, i) => (
            <Hand
              key={i}
              cards={h.cards}
              label={totalLabel(h.cards)}
              bet={h.bet}
              active={playerCanAct && g.hands.length > 1 && i === g.active}
              outcome={table.settled && g.phase === 'done' ? h.outcome : null}
              small={g.hands.length > 2}
            />
          ))}
          {!g.hands.length && <p className="self-center text-sm text-white/60">Place a bet and deal to start.</p>}
        </div>

        <div className="mt-4 min-h-12 text-center" aria-live="polite">
          {g.phase === 'insurance' && (
            <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-black/50 p-2 pl-4 animate-scale-in">
              <span className="text-sm text-white">Dealer shows an ace. Insurance for {formatCurrency(g.hands[0].bet / 2)}?</span>
              <button type="button" className="btn btn-primary px-3" onClick={() => insure(true)} disabled={balance < g.hands[0].bet / 2}>
                Take insurance
              </button>
              <button type="button" className="btn btn-ghost bg-white/10 px-3 text-white" onClick={() => insure(false)}>
                No thanks
              </button>
            </div>
          )}
          {g.phase === 'done' && table.settled && g.result && (
            <div className={`inline-flex flex-col items-center rounded-2xl bg-black/50 px-5 py-2 animate-scale-in ${net > 0 ? 'animate-win-pulse' : ''}`}>
              <span className={`text-lg font-bold tabular ${net > 0 ? 'text-yes' : net < 0 ? 'text-no' : 'text-white'}`}>
                {net > 0 ? `You win ${formatCurrency(net)}` : net < 0 ? `You lose ${formatCurrency(-net)}` : 'Push, bet returned'}
              </span>
              {g.result.dealerBlackjack && <span className="text-xs text-white/70">Dealer has blackjack{g.result.insuranceBack ? `. Insurance paid ${formatCurrency(g.result.insuranceBack)}` : ''}</span>}
            </div>
          )}
          {g.reshuffled && g.phase !== 'done' && <p className="text-xs text-white/60">The shoe was reshuffled.</p>}
        </div>
      </section>

      <section className="card space-y-4 p-4" aria-label="Controls">
        {betting ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ChipSelector value={chip} onChange={(v) => {
                  setChip(v)
                  addChip(v)
                }} />
              <div className="text-right">
                <p className="text-xs text-muted">Bet</p>
                <p className="text-xl font-bold tabular">{formatCurrency(bet)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setBet(0)} disabled={!bet}>
                Clear
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setBet(Math.max(1, Math.floor(bet / 2)))} disabled={bet < 2}>
                ½
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => addChip(bet)} disabled={!bet}>
                2×
              </button>
              <button type="button" className="btn btn-primary ml-auto min-w-32 px-6" onClick={startRound} disabled={!bet || bet > balance}>
                Deal
              </button>
            </div>
            <p className="text-xs text-subtle">Click a chip to add it to your bet.</p>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" className="btn btn-primary" disabled={!playerCanAct || busy} onClick={() => update(bj.hit(g))}>
              Hit
            </button>
            <button type="button" className="btn btn-ghost" disabled={!playerCanAct || busy} onClick={() => update(bj.stand(g))}>
              Stand
            </button>
            <button type="button" className="btn btn-ghost" disabled={!bj.canDouble(g) || balance < bj.cost(g, 'double')} onClick={doubleDown}>
              Double
            </button>
            <button type="button" className="btn btn-ghost" disabled={!bj.canSplit(g) || balance < bj.cost(g, 'split')} onClick={splitHand}>
              Split
            </button>
          </div>
        )}
      </section>
    </>
  )
}

export default function BlackjackPage() {
  useDocumentTitle('Blackjack')
  const owner = useGameStore((s) => s.owner)
  const loaded = useGameStore((s) => s.loaded)
  return (
    <GameShell game="blackjack" title="Blackjack" subtitle="Six decks. Blackjack pays 3:2, dealer stands on soft 17." rules={<Rules />}>
      {loaded ? <Table key={owner ?? 'guest'} owner={owner} /> : <div className="felt h-96 rounded-3xl" />}
    </GameShell>
  )
}
