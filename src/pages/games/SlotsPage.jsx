import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { useSpaceToPlay } from '../../components/games/limbo/fx.js'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { CAP_X, FREE_SPIN_MULT, LINE_COUNT, LINES, MAX_FREE_SPINS, PAY, PAYING, SCATTER_PAY, SCATTER_SPINS, SYMBOL_NAME } from '../../games/slots.js'
import { tone } from '../../games/sound.js'
import { slotsDetail, spinSlots } from '../../services/games/slots.js'
import { useAccountStore } from '../../store/accountStore.js'
import { finish, holdServerPortfolio, place, useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { formatCurrency } from '../../utils/format.js'
import { roundMoney } from '../../utils/math.js'
import './slots.css'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const cash = () => useAccountStore.getState().portfolio?.cash ?? 0
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const sfx = {
  stop: (r) => tone(220 + r * 40, { dur: 0.06, type: 'square', gain: 0.05 }),
  win: (x) => [523, 659, 784, 1047].slice(0, x >= 5 ? 4 : x >= 1 ? 3 : 2).forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.16, type: 'triangle', gain: 0.08 })),
  scatter: () => [880, 1175, 1568].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.22, type: 'sine', gain: 0.09 })),
  big: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, { at: i * 0.11, dur: 0.3, type: 'triangle', gain: 0.1 })),
}

const LOOK = {
  cherry: '🍒',
  lemon: '🍋',
  orange: '🍊',
  plum: '🍇',
  bell: '🔔',
  diamond: '💎',
  scatter: '⭐',
}
const FILLER = ['cherry', 'lemon', 'orange', 'plum', 'bell', 'bar', 'seven', 'diamond', 'wild', 'scatter']

function SlotSymbol({ sym, mult, small }) {
  if (sym === 'seven') {
    return <span className={`font-black italic text-red-500 drop-shadow-[0_2px_0_#7f1d1d] ${small ? 'text-xl' : 'text-4xl sm:text-5xl'}`}>7</span>
  }
  if (sym === 'bar') {
    return (
      <span className={`rounded-md bg-gradient-to-b from-zinc-100 to-zinc-400 px-1.5 font-black tracking-tight text-zinc-900 ${small ? 'text-[10px]' : 'text-sm sm:text-base'}`}>
        BAR
      </span>
    )
  }
  if (sym === 'wild') {
    return (
      <span className="flex flex-col items-center leading-none">
        <span className={`font-black tracking-wider text-amber-300 ${small ? 'text-[9px]' : 'text-xs sm:text-sm'}`}>WILD</span>
        {mult > 1 && !small && <span className="mt-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-black text-black sm:text-sm">{mult}×</span>}
      </span>
    )
  }
  return <span className={small ? 'text-xl' : 'text-3xl sm:text-4xl'}>{LOOK[sym] ?? '?'}</span>
}

/** One reel: a blurred strip while it spins, the three landed symbols once it stops. */
function Reel({ index, cells, mults, spinning, spinKey, hits, dim }) {
  const strip = useMemo(() => Array.from({ length: 12 }, (_, i) => FILLER[(i * 7 + index * 3 + spinKey) % FILLER.length]), [index, spinKey])
  return (
    <div className="slot-reel relative h-full overflow-hidden rounded-lg">
      {spinning ? (
        <div className="slot-strip flex flex-col">
          {[...strip, ...strip].map((s, i) => (
            <div key={i} className="flex aspect-square items-center justify-center">
              <SlotSymbol sym={s} mult={1} />
            </div>
          ))}
        </div>
      ) : (
        <div key={spinKey} className="slot-land flex h-full flex-col">
          {cells.map((s, row) => (
            <div
              key={row}
              className={`slot-cell m-0.5 flex flex-1 items-center justify-center rounded-md transition ${s === 'wild' ? 'bg-amber-500/20' : s === 'scatter' ? 'bg-fuchsia-500/15' : ''} ${
                hits.has(row) ? 'is-hit' : dim ? 'is-dim' : ''
              }`}
              aria-label={`${SYMBOL_NAME[s]}${s === 'wild' && mults[row] > 1 ? ` ${mults[row]} times` : ''}`}
            >
              <SlotSymbol sym={s} mult={mults[row]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const TIERS = [
  { min: 250, label: 'EPIC WIN' },
  { min: 50, label: 'MEGA WIN' },
  { min: 10, label: 'BIG WIN' },
]

function BigWin({ win, onClose }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let raf
    const start = performance.now()
    const dur = reduced() ? 0 : 1800
    const step = (t) => {
      const p = dur ? Math.min(1, (t - start) / dur) : 1
      setShown(win.amount * (1 - (1 - p) ** 3))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const close = setTimeout(onClose, 3600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(close)
    }
  }, [win, onClose])
  const coins = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 7) * 0.18, dur: 1.6 + (i % 5) * 0.35 })), [])
  return (
    <button
      type="button"
      onClick={onClose}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-black/75 backdrop-blur-sm"
      aria-label={`${win.label}: ${formatCurrency(win.amount)}. Tap to continue.`}
    >
      {coins.map((c, i) => (
        <span key={i} className="slot-coin text-2xl" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s` }} aria-hidden="true">
          🪙
        </span>
      ))}
      <span className="slot-big slot-big-title text-5xl font-black tracking-tight sm:text-7xl">{win.label}</span>
      <span className="slot-big mt-3 font-mono text-3xl font-black text-white tabular sm:text-5xl">{formatCurrency(shown)}</span>
      <span className="mt-2 text-sm font-semibold text-amber-200">{win.x.toLocaleString('en-US', { maximumFractionDigits: 2 })}× your bet</span>
    </button>
  )
}

function Paytable({ bet }) {
  const line = bet / LINE_COUNT
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[...PAYING].reverse().map((s) => (
        <div key={s} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5">
          <span className="flex w-9 justify-center">
            <SlotSymbol sym={s} mult={1} small />
          </span>
          <span className="text-[11px] leading-tight text-muted tabular">
            {PAY[s].map((p, i) => (
              <span key={i} className="block">
                {i + 3}× {formatCurrency(line * p)}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

function Rules() {
  return (
    <>
      <p>
        Five reels, three rows and {LINE_COUNT} fixed paylines. A line pays for 3, 4 or 5 matching symbols in a row from the leftmost reel. Each line bets{' '}
        {1 / LINE_COUNT} of your total bet, and the paytable shows what each line pays at your current bet.
      </p>
      <p>
        <span className="font-semibold text-fg">Wilds</span> land on reels 2 to 4, stand in for every symbol except ⭐, and carry a 2×, 3×, 5× or 10×
        multiplier. Several wilds on one line multiply together, so three 10× wilds make a line pay 1,000×.
      </p>
      <p>
        <span className="font-semibold text-fg">⭐ Stars</span> pay anywhere: 3, 4 or 5 pay {SCATTER_PAY.join('×, ')}× your bet and start{' '}
        {SCATTER_SPINS.join(', ')} free spins. Every win in free spins pays {FREE_SPIN_MULT}×, and stars there add more spins, up to {MAX_FREE_SPINS}.
      </p>
      <p>
        A round pays at most {CAP_X.toLocaleString('en-US')}× your bet. The long-run return is about 96%. Every spin is provably fair: open Fairness to
        check past spins.
      </p>
    </>
  )
}

const BLANK = { grid: [FILLER.slice(0, 3), FILLER.slice(3, 6), FILLER.slice(6, 9), FILLER.slice(1, 4), FILLER.slice(4, 7)], mults: Array.from({ length: 5 }, () => [1, 1, 1]), wins: [] }

export default function SlotsPage() {
  useDocumentTitle('Games')
  const balance = useChips()
  const [betText, setBetText] = useState('1')
  const [mode, setMode] = useState('manual')
  const [auto, setAuto] = useState(DEFAULT_AUTO)
  const [turbo, setTurbo] = useState(false)
  const [spin, setSpin] = useState(BLANK)
  const [spinning, setSpinning] = useState([false, false, false, false, false])
  const [spinKey, setSpinKey] = useState(0)
  const [lineIdx, setLineIdx] = useState(0)
  const [free, setFree] = useState(null)
  const [winText, setWinText] = useState(null)
  const [bigWin, setBigWin] = useState(null)
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const runner = useAutoBet()
  const busyRef = useRef(false)
  const bigClose = useRef(null)
  const bet = roundMoney(Number(betText) || 0)
  const locked = busy || runner.running
  const anySpinning = spinning.some(Boolean)

  // Cycle through the winning lines one at a time.
  useEffect(() => {
    if (anySpinning || spin.wins.length < 2) return undefined
    const t = setInterval(() => setLineIdx((i) => (i + 1) % spin.wins.length), 1100)
    return () => clearInterval(t)
  }, [spin, anySpinning])

  const showSpin = async (s, quick) => {
    const fast = quick || turbo
    setSpinKey((k) => k + 1)
    setLineIdx(0)
    setSpinning([true, true, true, true, true])
    await sleep(fast ? 160 : 520)
    for (let r = 0; r < 5; r++) {
      setSpin(s)
      setSpinning((prev) => prev.map((v, i) => (i <= r ? false : v)))
      sfx.stop(r)
      await sleep(fast ? 50 : 150)
    }
  }

  const playOnce = async (amount, quick) => {
    if (!(amount >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
    if (amount > cash() + 1e-9) throw new Error(`Your balance is ${formatCurrency(cash())}.`)
    const res = await spinSlots({ amount })
    const { round } = res
    const id = place({ game: 'slots', staked: amount, returned: res.payout, detail: slotsDetail(round) })
    if (res.portfolio) holdServerPortfolio(res.portfolio)
    if (!id && !res.portfolio) throw new Error('Not enough chips.')
    const fast = quick || turbo
    const money = (units) => formatCurrency(Math.min(res.payout, (amount * units) / 100))
    setWinText(null)
    setFree(null)
    let total = 0
    let awarded = Math.min(MAX_FREE_SPINS, round.spins[0].freeSpins)
    for (let i = 0; i < round.spins.length; i++) {
      const s = round.spins[i]
      if (i > 0) setFree({ n: i, of: awarded, total })
      await showSpin(s, quick)
      total += s.units
      if (s.scatters >= 3) {
        sfx.scatter()
        if (i > 0) awarded = Math.min(MAX_FREE_SPINS, awarded + s.freeSpins)
        setFree({ n: i, of: awarded, total, trigger: s.freeSpins })
      } else if (i > 0) {
        setFree({ n: i, of: awarded, total })
      }
      if (s.units > 0) {
        sfx.win(s.units / 100)
        setWinText(i > 0 ? `Free spin win ${money(s.units)}` : `Win ${money(s.units)}`)
      } else if (i === 0) {
        setWinText(null)
      }
      await sleep(fast ? (s.units > 0 || s.scatters >= 3 ? 260 : 90) : s.units > 0 || s.scatters >= 3 ? 1000 : 380)
    }
    setFree(null)
    if (res.payout > 0) setWinText(`${round.capped ? 'Max win! ' : ''}Total win ${formatCurrency(res.payout)}`)
    const x = round.units / 100
    const tier = TIERS.find((t) => x >= t.min)
    if (tier && !quick) {
      sfx.big()
      await new Promise((resolve) => {
        bigClose.current = () => {
          setBigWin(null)
          resolve()
        }
        setBigWin({ label: tier.label, amount: res.payout, x })
      })
    }
    setRecent((r) => [{ x, key: `${res.nonce}-${Date.now()}`, free: round.freeSpins > 0 }, ...r].slice(0, 14))
    if (id) finish(id)
    return { net: roundMoney(res.payout - amount) }
  }

  const spinManual = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await playOnce(bet, false)
    } catch (err) {
      toast({ tone: 'error', title: 'Spin not placed', description: err.message })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  // Space spins (unless typing, on another control, or a dialog is open).
  useSpaceToPlay(spinManual, mode === 'manual' && !runner.running)

  const startAuto = () => {
    if (busyRef.current) return
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    runner.start({ settings: auto, baseBet: bet, play: (amount) => playOnce(amount, true), balance: cash, gapMs: 120 })
  }

  const active = !anySpinning && spin.wins.length ? spin.wins[lineIdx % spin.wins.length] : null
  const scatterHit = spin.grid.flat().filter((x) => x === 'scatter').length >= 3
  const hitRows = (r) => {
    const set = new Set()
    if (anySpinning) return set
    if (active && r < active.count) set.add(LINES[active.line][r])
    if (scatterHit) spin.grid[r].forEach((s, row) => s === 'scatter' && set.add(row))
    return set
  }
  const dimOthers = Boolean(active)
  const closeBig = useCallback(() => bigClose.current?.(), [])

  return (
    <GameShell game="slots" title="Golden Sevens" subtitle={`A classic 5-reel slot with 20 lines and multiplier wilds. Up to ${CAP_X.toLocaleString('en-US')}× your bet.`} rules={<Rules />}>
      <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <section className="card order-2 space-y-4 p-4 md:order-1" aria-label="Slot controls">
          <ModeTabs value={mode} onChange={setMode} disabled={locked} />
          <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked} />
          <p className="text-xs text-muted tabular">
            {LINE_COUNT} lines × {formatCurrency(bet / LINE_COUNT)}
          </p>
          <label className="flex cursor-pointer items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span>Turbo spins</span>
            <input type="checkbox" className="size-4 accent-amber-400" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} />
          </label>
          {mode === 'manual' ? (
            <button
              type="button"
              className="btn w-full bg-gradient-to-b from-amber-300 to-amber-600 py-3.5 text-lg font-black text-black shadow-lg shadow-amber-900/40 hover:brightness-110 disabled:opacity-50"
              onClick={spinManual}
              disabled={locked || !(bet >= 0.1) || bet > balance}
            >
              {busy ? 'Spinning…' : 'SPIN'}
            </button>
          ) : (
            <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running}>
              {runner.running ? (
                <button type="button" className="btn btn-ghost w-full py-3" onClick={runner.stop}>
                  Stop autoplay
                </button>
              ) : (
                <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={startAuto} disabled={busy || !(bet >= 0.1) || bet > balance}>
                  Start autoplay
                </button>
              )}
            </AutoSettings>
          )}
          <p className="hidden text-center text-[11px] text-subtle md:block">Press Space to spin</p>
        </section>

        <section className="card order-1 space-y-4 p-3 sm:p-5 md:order-2" aria-label="Golden Sevens">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-h-7 flex-wrap gap-1.5" aria-label="Recent spins">
              {recent.map((r, i) => (
                <span
                  key={r.key}
                  className={`rounded-md px-2 py-1 font-mono text-[11px] font-bold ${i === 0 ? 'animate-chip-pop' : ''} ${
                    r.x >= 10 ? 'bg-amber-400 text-black' : r.x >= 1 ? 'bg-yes text-black' : r.x > 0 ? 'bg-surface-3 text-fg' : 'bg-surface-3 text-subtle'
                  }`}
                >
                  {r.free ? '⭐ ' : ''}
                  {r.x.toFixed(2)}×
                </span>
              ))}
            </div>
            <div className="flex shrink-0 gap-2">
              <FairnessButton game="slots" />
              <SoundToggle />
            </div>
          </div>

          <div className={`slot-frame relative rounded-2xl p-2 sm:p-3 ${free?.n > 0 ? 'is-free' : ''} ${turbo ? 'slot-fast' : ''}`}>
            <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-bold tracking-widest text-amber-200/80 sm:text-xs">
              <span>GOLDEN SEVENS</span>
              <span>{free?.n > 0 ? `FREE SPIN ${free.n} / ${free.of} · ALL WINS ×${FREE_SPIN_MULT}` : `${LINE_COUNT} LINES`}</span>
            </div>
            <div className="relative grid aspect-[5/3] grid-cols-5 gap-1 sm:gap-1.5">
              {spin.grid.map((cells, r) => (
                <Reel key={r} index={r} cells={cells} mults={spin.mults[r]} spinning={spinning[r]} spinKey={spinKey} hits={hitRows(r)} dim={dimOthers} />
              ))}
              {active && (
                <svg viewBox="0 0 500 300" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                  <polyline
                    className="slot-line"
                    points={LINES[active.line].map((row, r) => `${r * 100 + 50},${row * 100 + 50}`).join(' ')}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="5"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </div>
            {bigWin && <BigWin win={bigWin} onClose={closeBig} />}
          </div>

          <div className="min-h-12 text-center" aria-live="polite">
            {active && (
              <p className="text-xs text-amber-200/80">
                Line {active.line + 1}: {active.count} × {SYMBOL_NAME[active.symbol]}
                {active.mult > 1 ? ` with ${active.mult}× wilds` : ''}
              </p>
            )}
            {free?.trigger ? (
              <p className="text-base font-black text-fuchsia-300">⭐ {free.n ? `+${free.trigger} more free spins!` : `${free.trigger} free spins!`}</p>
            ) : winText ? (
              <p className="text-lg font-black text-yes">{winText}</p>
            ) : (
              <p className="text-sm text-muted">{locked ? 'Good luck!' : recent.length ? 'No win this time. Spin again!' : 'Spin to play. 3 ⭐ start the free spins.'}</p>
            )}
          </div>

          <details className="rounded-xl bg-surface-2/60 p-3">
            <summary className="cursor-pointer text-sm font-semibold">Paytable at {formatCurrency(bet)} a spin</summary>
            <div className="mt-3 space-y-2">
              <Paytable bet={bet} />
              <p className="text-xs text-muted">
                ⭐ anywhere: 3 pay {formatCurrency(bet * SCATTER_PAY[0])}, 4 pay {formatCurrency(bet * SCATTER_PAY[1])}, 5 pay {formatCurrency(bet * SCATTER_PAY[2])}, plus free
                spins. WILD multipliers multiply the line.
              </p>
            </div>
          </details>
        </section>
      </div>
    </GameShell>
  )
}
