import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import CrashChart from '../../components/games/limbo/CrashChart.jsx'
import { easeOutCubic, tween, useSpaceToPlay } from '../../components/games/limbo/fx.js'
import { Confetti, HistoryStrip, WinPop } from '../../components/games/limbo/GameFx.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { clampTarget, formatMult, MAX_RESULT, MIN_TARGET, multiplierAt, RTP, targetForChance, timeTo, winChance } from '../../games/limbo.js'
import { GAME_PATH } from '../../games/names.js'
import { limboSounds } from '../../games/sounds/limbo.js'
import { crashApi, limboDetail, playLimbo } from '../../services/games/limbo.js'
import { useAccountStore } from '../../store/accountStore.js'
import { finish, holdServerPortfolio, place, useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { formatCurrency } from '../../utils/format.js'
import { roundMoney } from '../../utils/math.js'
import './limbo.css'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const cash = () => useAccountStore.getState().portfolio?.cash ?? 0
const TARGET_PRESETS = [1.5, 2, 3, 5, 10, 100]
/** Crash milestones that ping as the multiplier passes them. */
const MILESTONES = [1.5, 2, 3, 5, 10, 20, 50, 100, 250, 500, 1000, 5000, 10000, 100000]
/** After a round ends the Bet button waits this long, so a late Cash out tap cannot start a new round. */
const REBET_GUARD_MS = 650

/** Blurs a number box on Enter, which commits what was typed. */
const commitOnEnter = (e) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

function Rules({ crash }) {
  return (
    <>
      {crash ? (
        <p>
          Place a bet and the multiplier starts climbing from 1.00×. Cash out whenever you like to win your bet times the multiplier at that moment. If it
          crashes first, the bet is lost. Set an auto cash-out to bank a win the moment the multiplier reaches it.
        </p>
      ) : (
        <p>
          Pick a target multiplier, then bet. Each round draws a result from 1.00× up to {MAX_RESULT.toLocaleString('en-US')}×. If the result reaches your
          target you win your bet times the target; if not, the bet is lost. The higher the target, the lower the chance.
        </p>
      )}
      <p>
        Both modes use the same draw: the chance of reaching any multiplier x is {RTP}% ÷ x, so every target or cash-out returns {RTP}% over the long run (a 1%
        house edge). A 2× target wins 49.5% of the time, a 10× target 9.9%.
      </p>
      <p>Every result is provably fair: it comes from your seeds, and the Fairness panel recomputes past rounds.</p>
      <p>Tip: press Space to {crash ? 'bet or cash out' : 'bet'} when you are not typing in a box.</p>
    </>
  )
}

function GameSwitch({ crash }) {
  const item = (to, label, on) => (
    <Link
      to={to}
      aria-current={on ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? 'bg-surface-3 text-fg shadow' : 'text-muted hover:text-fg'}`}
    >
      {label}
    </Link>
  )
  return (
    <nav aria-label="Game" className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
      {item(GAME_PATH.limbo, 'Limbo', !crash)}
      {item(GAME_PATH.crash, 'Crash', crash)}
    </nav>
  )
}

/** Game switch, fairness and sound. The two buttons shrink to icons on narrow phones (see limbo.css). */
function Toolbar({ crash }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <GameSwitch crash={crash} />
      <div className="pdl-tools flex shrink-0 gap-2">
        <FairnessButton game={crash ? 'crash' : 'limbo'} />
        <SoundToggle />
      </div>
    </div>
  )
}

const historyItems = (list) =>
  list.map((r) => ({
    key: r.key,
    text: formatMult(r.value),
    title: r.cashout ? `Cashed out at ${formatMult(r.cashout)}, crashed at ${formatMult(r.value)}` : r.win ? 'Win' : 'Loss',
    className: r.win ? (r.value >= 10 ? 'bg-warn text-black' : 'bg-yes text-black') : 'bg-surface-3 text-muted',
  }))

/** A big result number that shrinks to fit long values like 1,000,000.00×. */
const numSize = (label, max = 6) => `min(${max}rem, ${Math.floor(140 / Math.max(5, label.length))}cqw)`

// Limbo ---------------------------------------------------------------------------

function LimboGame() {
  const balance = useChips()
  const [betText, setBetText] = useState('10')
  const [target, setTarget] = useState(2)
  const [targetText, setTargetText] = useState(null)
  const [chanceText, setChanceText] = useState(null)
  const [mode, setMode] = useState('manual')
  const [auto, setAuto] = useState(DEFAULT_AUTO)
  const [shown, setShown] = useState(null)
  const [last, setLast] = useState(null)
  const [rising, setRising] = useState(false)
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const [pop, setPop] = useState(null)
  const [burst, setBurst] = useState(0)
  const runner = useAutoBet()
  const busyRef = useRef(false)
  const bet = roundMoney(Number(betText) || 0)
  const locked = busy || runner.running

  /** Counts the number up to the result (faster for small results and in autobet), then pays. */
  const playOnce = async (amount, quick) => {
    if (!(amount >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
    if (amount > cash() + 1e-9) throw new Error(`Your balance is ${formatCurrency(cash())}.`)
    const res = await playLimbo({ amount, target })
    const id = place({ game: 'limbo', staked: amount, returned: res.payout, detail: limboDetail(res) })
    if (res.portfolio) holdServerPortfolio(res.portfolio)
    if (!id && !res.portfolio) throw new Error('Not enough chips.')
    setLast(null)
    setPop(null)
    setRising(true)
    const span = Math.log(res.result)
    const ms = quick ? 100 : Math.min(1400, 420 + 240 * Math.log10(res.result))
    await tween(ms, (p) => {
      const e = easeOutCubic(p)
      // Climbs in multiplicative steps so a 5,000× result races through the hundreds.
      setShown(Math.max(1, Math.floor(Math.exp(span * e) * 100) / 100))
      if (!quick && p < 1) limboSounds.tick(e)
    })
    setShown(res.result)
    setRising(false)
    setLast(res)
    setRecent((r) => [{ value: res.result, win: res.win, key: `${res.nonce}-${Date.now()}` }, ...r].slice(0, 20))
    if (res.win) {
      limboSounds.win(res.target)
      setPop({ id: `${res.nonce}-${Date.now()}`, text: `+${formatCurrency(roundMoney(res.payout - amount))}` })
      if (res.target >= 10) setBurst((b) => b + 1)
    } else limboSounds.lose()
    if (id) finish(id)
    if (!quick) await sleep(120)
    return { net: roundMoney(res.payout - amount) }
  }

  const betManual = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await playOnce(bet, false)
    } catch (err) {
      toast({ tone: 'error', title: 'Bet not placed', description: err.message })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const startAuto = () => {
    if (busyRef.current) return
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    runner.start({ settings: auto, baseBet: bet, play: (amount) => playOnce(amount, true), balance: cash, gapMs: 120 })
  }

  const canBet = bet >= 0.1 && bet <= balance
  const mainAction = () => {
    if (mode === 'manual') {
      if (!locked && canBet) betManual()
    } else if (runner.running) runner.stop()
    else if (canBet) startAuto()
  }
  useSpaceToPlay(mainAction)

  const chance = winChance(target)
  const label = formatMult(shown ?? 1)
  const crossed = rising && shown >= target
  const tone = last ? (last.win ? 'win' : 'loss') : rising ? (crossed ? 'win' : 'rising') : 'idle'
  const numColor = tone === 'win' ? 'text-yes' : tone === 'loss' ? 'text-no' : 'text-fg'

  const mainButton =
    mode === 'manual' ? (
      <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={betManual} disabled={locked || !canBet}>
        {busy ? 'Drawing…' : 'Bet'}
      </button>
    ) : runner.running ? (
      <button type="button" className="btn btn-ghost w-full py-3 text-base" onClick={runner.stop}>
        Stop autobet
      </button>
    ) : (
      <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={startAuto} disabled={busy || !canBet}>
        Start autobet
      </button>
    )

  return (
    <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
      <section className="card order-2 flex flex-col gap-4 p-4 md:order-1" aria-label="Limbo controls">
        <ModeTabs value={mode} onChange={setMode} disabled={locked} />
        <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked} />
        <div>
          <p className="text-xs font-medium text-muted">Profit on win</p>
          <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 font-semibold text-yes tabular">{formatCurrency(roundMoney(bet * target - bet))}</p>
        </div>
        <div className="max-md:order-first">{mainButton}</div>
        {mode === 'auto' && <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running} />}
      </section>

      <section className="card order-1 min-w-0 space-y-4 p-4 sm:p-6 md:order-2" aria-label="Limbo">
        <Toolbar crash={false} />
        <HistoryStrip items={historyItems(recent)} empty="Your results show up here." />
        <div className="limbo-stage flex h-48 flex-col items-center justify-center rounded-2xl px-3 sm:h-64" data-tone={tone} style={{ containerType: 'inline-size' }}>
          {last && <div key={`${last.nonce}-${last.result}`} className={`pointer-events-none absolute inset-0 rounded-2xl ${last.win ? 'fx-glow-win' : 'fx-glow-loss'}`} aria-hidden="true" />}
          <div className="absolute top-4 flex h-8 items-center">
            <WinPop pop={pop} />
          </div>
          <p className={`limbo-num font-mono font-black tabular transition-colors duration-150 ${numColor} ${last?.win ? 'fx-pop' : ''}`} style={{ '--size': numSize(label) }}>
            {label}
          </p>
          <p className="mt-3 text-sm text-white/70 tabular">
            Target <span className="font-semibold text-white">{formatMult(target)}</span> · {chance}% chance
          </p>
          <Confetti burst={burst} />
        </div>
        <p className="sr-only" aria-live="polite">
          {last ? `Result ${formatMult(last.result)}, ${last.win ? `win, ${formatCurrency(last.payout)} returned` : 'loss'}` : ''}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="text-xs font-medium text-muted">Target multiplier</span>
            <div className="relative mt-1.5">
              <input
                type="number"
                inputMode="decimal"
                min={MIN_TARGET}
                max={MAX_RESULT}
                step="0.01"
                className="input pr-7 tabular"
                value={targetText ?? target.toFixed(2)}
                disabled={locked}
                onChange={(e) => setTargetText(e.target.value)}
                onKeyDown={commitOnEnter}
                onBlur={() => {
                  if (targetText !== null && Number(targetText) > 0) setTarget(clampTarget(targetText))
                  setTargetText(null)
                }}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">×</span>
            </div>
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-medium text-muted">Win chance</span>
            <div className="relative mt-1.5">
              <input
                type="number"
                inputMode="decimal"
                min="0.0001"
                max="98.0198"
                step="0.01"
                className="input pr-7 tabular"
                value={chanceText ?? chance}
                disabled={locked}
                onChange={(e) => setChanceText(e.target.value)}
                onKeyDown={commitOnEnter}
                onBlur={() => {
                  const c = Number(chanceText)
                  if (c > 0) setTarget(targetForChance(Math.min(98.0198, c)))
                  setChanceText(null)
                }}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>
            </div>
          </label>
        </div>
        <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Quick targets">
          {TARGET_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={locked}
              aria-pressed={target === t}
              onClick={() => setTarget(t)}
              aria-label={`Target ${formatMult(t)}`}
              className={`rounded-lg px-1 py-1.5 font-mono text-xs font-bold tabular transition disabled:opacity-50 ${target === t ? 'bg-surface-3 text-fg ring-1 ring-line-strong' : 'bg-surface-2 text-muted hover:text-fg'}`}
            >
              {t}×
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

// Crash ---------------------------------------------------------------------------

function CrashGame() {
  const balance = useChips()
  const [betText, setBetText] = useState('10')
  const [autoText, setAutoText] = useState('')
  const [round, setRound] = useState({ phase: 'idle' })
  const [elapsed, setElapsed] = useState(0)
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const [cooling, setCooling] = useState(false)
  const [celebrate, setCelebrate] = useState(0)
  // Whether the shown round ended while watching (a round restored after a reload skips the crash effects).
  const [live, setLive] = useState(false)
  const sync = useRef({ elapsed: 0, at: 0 })
  const phase = useRef('idle')
  const milestone = useRef(0)
  const bet = roundMoney(Number(betText) || 0)
  const autoAt = Number(autoText) >= MIN_TARGET ? clampTarget(autoText) : null
  const autoInvalid = autoText !== '' && autoAt === null
  const playing = round.phase === 'playing'

  const take = (r) => {
    sync.current = { elapsed: r.elapsed ?? 0, at: performance.now() }
    if (r.phase === 'done' && phase.current === 'playing') {
      if (r.result.win) {
        limboSounds.cashout(r.result.cashout)
        if (r.result.cashout >= 5) setCelebrate((c) => c + 1)
      } else limboSounds.crash()
      setRecent((list) => [{ value: r.result.crash, win: r.result.win, cashout: r.result.cashout, key: `${r.nonce}-${Date.now()}` }, ...list].slice(0, 20))
      setLive(true)
      setCooling(true)
      setTimeout(() => setCooling(false), REBET_GUARD_MS)
    }
    phase.current = r.phase
    setRound(r)
  }

  // Picks up a round left running (after a reload, say).
  useEffect(() => {
    crashApi.state().then(take, () => {})
  }, [])

  // While a round runs: draw the curve every frame, ask the server about every 300 ms.
  useEffect(() => {
    if (!playing) return undefined
    let raf
    const frame = () => {
      const t = sync.current.elapsed + (performance.now() - sync.current.at)
      setElapsed(t)
      const m = multiplierAt(t)
      while (milestone.current < MILESTONES.length && m >= MILESTONES[milestone.current]) {
        limboSounds.milestone(milestone.current)
        milestone.current++
      }
      raf = requestAnimationFrame(frame)
    }
    milestone.current = MILESTONES.findIndex((m) => m > multiplierAt(sync.current.elapsed))
    if (milestone.current < 0) milestone.current = MILESTONES.length
    raf = requestAnimationFrame(frame)
    let running = true
    const poll = async () => {
      while (running) {
        await sleep(300)
        if (!running) break
        try {
          const r = await crashApi.state()
          if (running) take(r)
          if (r.phase !== 'playing') break
        } catch {
          // Try again on the next tick.
        }
      }
    }
    poll()
    return () => {
      running = false
      cancelAnimationFrame(raf)
    }
  }, [playing])

  const launch = async () => {
    setBusy(true)
    try {
      if (!(bet >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
      if (bet > cash() + 1e-9) throw new Error(`Your balance is ${formatCurrency(cash())}.`)
      const r = await crashApi.start({ amount: bet, auto: autoAt })
      limboSounds.launch()
      setLive(false)
      setElapsed(0)
      take(r)
    } catch (err) {
      toast({ tone: 'error', title: 'Bet not placed', description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const cashout = async () => {
    setBusy(true)
    try {
      take(await crashApi.cashout())
    } catch (err) {
      toast({ tone: 'error', title: 'Cash-out failed', description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const done = round.phase === 'done'
  const mult = done ? (round.result.win ? round.result.cashout : round.result.crash) : playing ? Math.min(multiplierAt(elapsed), round.auto ?? Infinity) : 1
  // A finished round is drawn up to its final multiplier, however long ago it ended.
  const shownElapsed = done ? timeTo(mult) : playing ? elapsed : 0
  const canBet = !busy && !cooling && bet >= 0.1 && bet <= balance
  useSpaceToPlay(() => {
    if (playing) {
      if (!busy) cashout()
    } else if (canBet) launch()
  })

  return (
    <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
      <section className="card order-2 flex flex-col gap-4 p-4 md:order-1" aria-label="Crash controls">
        <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={playing || busy} />
        <label className="block">
          <span className="text-xs font-medium text-muted">Auto cash-out (optional)</span>
          <div className="relative mt-1.5">
            <input
              type="number"
              inputMode="decimal"
              min={MIN_TARGET}
              max={MAX_RESULT}
              step="0.01"
              placeholder="Off"
              className="input pr-7 tabular"
              value={autoText}
              disabled={playing || busy}
              aria-invalid={autoInvalid || undefined}
              onChange={(e) => setAutoText(e.target.value)}
              onKeyDown={commitOnEnter}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">×</span>
          </div>
        </label>
        <div className="max-md:order-first">
          {/* One button that changes role, so focus stays on it from Bet to Cash out. */}
          <button
            type="button"
            className={`btn w-full py-3 text-base ${playing ? 'bg-yes font-bold text-black hover:brightness-110' : 'btn-primary'}`}
            onClick={playing ? cashout : launch}
            disabled={playing ? busy : !canBet}
          >
            {playing ? `Cash out ${formatCurrency(roundMoney(round.bet * Math.max(1, mult)))}` : busy ? 'Launching…' : 'Bet'}
          </button>
        </div>
        <p className={`text-xs leading-relaxed ${autoInvalid ? 'text-no' : 'text-subtle'}`}>
          {autoInvalid
            ? `Auto cash-out needs ${formatMult(MIN_TARGET)} or more; it is off for now.`
            : autoAt
              ? `Cashes out on its own at ${formatMult(autoAt)}, a ${winChance(autoAt)}% chance.`
              : 'Cash out by hand before it crashes.'}
        </p>
      </section>

      <section className="card order-1 min-w-0 space-y-4 p-4 sm:p-6 md:order-2" aria-label="Crash">
        <Toolbar crash />
        <HistoryStrip items={historyItems(recent)} label="Recent crash points" empty="Crash points show up here." />
        <CrashChart elapsed={shownElapsed} mult={mult} phase={round.phase} result={round.result} bet={round.bet ?? bet} celebrate={celebrate} live={live} />
        <p className="sr-only" aria-live="polite">
          {done
            ? round.result.win
              ? `Cashed out at ${formatMult(round.result.cashout)}, ${formatCurrency(round.result.payout)} returned. It crashed at ${formatMult(round.result.crash)}.`
              : `Crashed at ${formatMult(round.result.crash)}.`
            : playing
              ? 'Round started.'
              : ''}
        </p>
      </section>
    </div>
  )
}

export default function LimboPage({ crash = false }) {
  useDocumentTitle('Games')
  return (
    <GameShell
      game={crash ? 'crash' : 'limbo'}
      title={crash ? 'Crash' : 'Limbo'}
      subtitle={crash ? 'Watch the multiplier climb and cash out before it crashes.' : 'Pick a target multiplier and hope the draw reaches it.'}
      rules={<Rules crash={crash} />}
    >
      {crash ? <CrashGame /> : <LimboGame />}
    </GameShell>
  )
}
