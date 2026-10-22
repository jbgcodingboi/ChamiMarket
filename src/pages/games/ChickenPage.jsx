import { useEffect, useMemo, useRef, useState } from 'react'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import Road from '../../components/games/chicken/Road.jsx'
import { Confetti, Kbd, ResultCard, RoundHistory, Stat } from '../../components/games/mines/CasinoUI.jsx'
import { formatMult, latestRoundId, useCountUp, useHotkeys, useMediaQuery, useRecentRounds } from '../../components/games/mines/hooks.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { DIFFICULTIES, DIFFICULTY_IDS, laneMultipliers, RTP, survival } from '../../games/chicken.js'
import { chickenSounds } from '../../games/sounds/chicken.js'
import { chickenApi } from '../../services/games/rounds.js'
import { useAccountStore } from '../../store/accountStore.js'
import { finish, useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { formatCurrency } from '../../utils/format.js'
import './mines.css'
import './chicken.css'

const BIG_WIN = 5
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function Rules() {
  return (
    <>
      <p>
        Help the chicken across the road. Press Start to place your bet, then Cross to hop one lane at a time. Each lane you survive raises the multiplier;
        cash out whenever you like. Get hit and the round ends and the bet is lost.
      </p>
      <table className="w-full text-left">
        <thead>
          <tr className="text-xs text-subtle">
            <th className="py-1 font-medium">Difficulty</th>
            <th className="py-1 font-medium">Survive a lane</th>
            <th className="py-1 font-medium">Lanes</th>
            <th className="py-1 text-right font-medium">Top prize</th>
          </tr>
        </thead>
        <tbody>
          {DIFFICULTY_IDS.map((d) => (
            <tr key={d} className="border-t border-line">
              <td className="py-1.5">{DIFFICULTIES[d].label}</td>
              <td className="py-1.5 tabular">{Math.round(survival(d) * 100)}%</td>
              <td className="py-1.5 tabular">{DIFFICULTIES[d].lanes}</td>
              <td className="py-1.5 text-right font-semibold text-fg tabular">{laneMultipliers(d).at(-1).toLocaleString('en-US')}×</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Lane n pays {RTP / 100} ÷ (survival chance)ⁿ, so every lane returns {RTP}% over the long run. Auto mode crosses to a lane you choose and cashes out
        there.
      </p>
      <p>Keyboard: Space (or the up arrow) starts a round and crosses; C cashes out. In auto mode Space starts and stops autoplay.</p>
    </>
  )
}

export default function ChickenPage() {
  useDocumentTitle('Chicken Cross')
  const balance = useChips()
  const [betText, setBetText] = useState('10')
  const [difficulty, setDifficulty] = useState('medium')
  const [mode, setMode] = useState('manual')
  const [auto, setAuto] = useState(DEFAULT_AUTO)
  const [target, setTarget] = useState(3)
  const [round, setRound] = useState({ phase: 'idle' })
  const [shownLane, setShownLane] = useState(0)
  const [crashAt, setCrashAt] = useState(null)
  const [brake, setBrake] = useState(null)
  const [quick, setQuick] = useState(false)
  const [result, setResult] = useState(null)
  const [hold, setHold] = useState(null)
  const [live, setLive] = useState('')
  const [busy, setBusy] = useState(false)
  const runner = useAutoBet()
  const busyRef = useRef(false)
  const diffRefs = useRef({})
  const phone = useMediaQuery('(max-width: 639px)')
  const recent = useRecentRounds('chicken', hold ? hold.id : undefined)

  useEffect(() => {
    chickenApi
      .state()
      .then((r) => {
        if (r?.phase !== 'playing') return
        setRound(r)
        setDifficulty(r.difficulty)
        setBetText(String(r.bet))
        setShownLane(r.lane)
      })
      .catch(() => {})
  }, [])

  const bet = roundMoney(Number(betText) || 0)
  const playing = round.phase === 'playing'
  const done = round.phase === 'done'
  const diff = playing || done ? round.difficulty : difficulty
  const mults = useMemo(() => laneMultipliers(diff), [diff])
  const lanes = mults.length
  const locked = busy || runner.running
  const canBet = bet >= 0.1 && bet <= balance
  const viewH = phone ? 360 : 520

  const reset = () => {
    setCrashAt(null)
    setBrake(null)
    setResult(null)
    setShownLane(0)
  }

  /** Holds the next logged round out of the recent strip until the road has played it out. */
  const holdHistory = () => setHold({ id: latestRoundId(useAccountStore.getState().portfolio, 'chicken') })

  const showWin = (r, quiet) => {
    const { payout, multiplier: mult, lane, crashLane } = r.result
    if (!quiet || mult >= BIG_WIN) chickenSounds.cashout(mult)
    const note = lane >= r.lanes ? 'Crossed the whole road!' : crashLane ? `A car was waiting on lane ${crashLane}` : 'The road was clear the rest of the way'
    setResult({ key: r.nonce, win: true, payout, mult, title: mult >= BIG_WIN ? 'Big win' : 'Cashed out', note: quiet ? undefined : note, confetti: mult >= (quiet ? BIG_WIN * 2 : BIG_WIN) })
    setLive(`Cashed out ${formatCurrency(payout)} at ${formatMult(mult)} on lane ${lane}.`)
  }

  /** Plays out a finished round on the road: hops to where it ended, then the win or the crash. */
  const animateTo = async (r, fromLane, fast) => {
    const end = r.result.win ? r.result.lane : r.result.hitLane
    const gap = fast ? Math.max(70, Math.min(140, 1500 / Math.max(1, end - fromLane))) : 260
    setQuick(fast)
    for (let l = fromLane + 1; l <= end; l++) {
      setShownLane(l)
      chickenSounds.hop(l)
      await sleep(gap)
    }
    if (r.result.win) showWin(r, fast)
    else {
      setCrashAt(r.result.hitLane)
      chickenSounds.squash()
      await sleep(260)
      setResult({ key: r.nonce, win: false, title: `Hit on lane ${r.result.hitLane}`, sub: `-${formatCurrency(r.bet)}` })
      setLive(`Hit by a car on lane ${r.result.hitLane}. Bet of ${formatCurrency(r.bet)} lost.`)
    }
    setHold(null)
  }

  const run = async (fn) => {
    if (busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    try {
      return await fn()
    } catch (err) {
      setHold(null)
      toast({ tone: 'error', title: 'Move not accepted', description: err.message })
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const start = () =>
    run(async () => {
      if (!(bet >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
      if (bet > balance) throw new Error('Not enough funds for this bet.')
      reset()
      setQuick(false)
      const r = await chickenApi.start({ amount: bet, difficulty })
      setRound(r)
      chickenSounds.start()
      setLive(`Bet placed on ${DIFFICULTIES[r.difficulty].label}. Cross to the first lane for ${formatMult(r.nextMultiplier)}.`)
    })

  const cross = () => {
    if (!playing || locked) return null
    return run(async () => {
      const from = round.lane
      holdHistory()
      const r = await chickenApi.step()
      setRound(r)
      if (r.phase === 'playing') {
        setHold(null)
        setQuick(false)
        setShownLane(r.lane)
        chickenSounds.hop(r.lane)
        setBrake({ lane: r.lane, key: r.lane })
        setTimeout(chickenSounds.nearMiss, 180)
        setLive(`Lane ${r.lane}, ${formatMult(r.multiplier)}. Cash out ${formatCurrency(r.payout)}${r.nextMultiplier ? `, or cross for ${formatMult(r.nextMultiplier)}` : ''}.`)
      } else await animateTo(r, from, false)
    })
  }

  const cashout = () => {
    if (!playing || locked || round.lane < 1) return null
    return run(async () => {
      const r = await chickenApi.cashout()
      setRound(r)
      setBrake(null)
      showWin(r, false)
    })
  }

  const pickDifficulty = (d) => {
    setDifficulty(d)
    if (done) {
      setRound({ phase: 'idle' })
      reset()
    }
  }

  const onDiffKey = (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = DIFFICULTY_IDS.indexOf(diff)
    const next = DIFFICULTY_IDS[(i + step + DIFFICULTY_IDS.length) % DIFFICULTY_IDS.length]
    pickDifficulty(next)
    diffRefs.current[next]?.focus()
  }

  const startAuto = () => {
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    runner.start({
      settings: auto,
      baseBet: bet,
      balance: () => useAccountStore.getState().portfolio?.cash ?? 0,
      gapMs: 600,
      play: async (amount) => {
        reset()
        holdHistory()
        const r = await chickenApi.auto({ amount, difficulty, target: Math.min(target, lanes) }).catch((err) => {
          setHold(null)
          throw err
        })
        setRound(r)
        await animateTo(r, 0, true)
        finish(r.holdId)
        return { net: roundMoney(r.result.payout - amount) }
      },
    })
  }

  const changeMode = (m) => {
    setMode(m)
    if (m === 'auto' && done) {
      setRound({ phase: 'idle' })
      reset()
    }
  }

  useHotkeys(
    mode === 'manual'
      ? { ' ': () => (playing ? cross() : !locked && canBet && start()), ArrowUp: playing ? cross : undefined, c: cashout }
      : { ' ': () => (runner.running ? runner.stop() : canBet && startAuto()) },
  )

  const statusOf = (n) => {
    if (crashAt === n) return 'hit'
    if (n < shownLane) return 'passed'
    if (n === shownLane) return 'current'
    if (n === shownLane + 1 && !done && !crashAt && (playing || mode === 'manual')) return 'next'
    return 'ahead'
  }
  const chickenState = crashAt ? 'hit' : result?.win ? 'won' : 'idle'
  const ghostLane = done && round.result?.win && round.result.crashLane > round.result.lane && mode === 'manual' ? round.result.crashLane : null

  // Readouts -------------------------------------------------------------------
  const autoTarget = Math.min(target, lanes)
  const multNow = playing ? round.multiplier : done ? round.result.multiplier : 1
  const multShown = useCountUp(multNow)
  const nextLane = playing ? round.lane + 1 : 1
  const nextMult = playing ? round.nextMultiplier : mults[0]
  const chance = survival(diff)
  const progress = (playing ? round.lane : done ? (round.result.win ? round.result.lane : round.result.hitLane) : 0) / lanes
  const multSub = playing
    ? round.lane
      ? `Pays ${formatCurrency(round.payout)}`
      : `Bet ${formatCurrency(round.bet)}`
    : done
      ? round.result.win
        ? `Won ${formatCurrency(round.result.payout)}`
        : `Lost ${formatCurrency(round.bet)}`
      : `Bet ${formatCurrency(bet)}`

  const actions =
    mode === 'manual' ? (
      playing ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          <button
            type="button"
            className="btn order-2 w-full bg-yes py-3.5 text-base font-bold text-black shadow-[0_0_28px_rgb(47_191_113/0.5)] hover:bg-yes-strong disabled:opacity-50 disabled:shadow-none md:order-1"
            onClick={cashout}
            disabled={locked || round.lane < 1}
            aria-keyshortcuts="C"
          >
            <span className="flex flex-col items-center leading-tight md:flex-row md:gap-1.5">
              <span className="text-xs font-bold tracking-wide uppercase md:text-base">Cash out</span>
              <span className="tabular">{round.lane ? formatCurrency(round.payout) : '—'}</span>
            </span>
            <Kbd>C</Kbd>
          </button>
          <button
            type="button"
            className="btn btn-primary order-1 w-full py-3.5 text-base font-bold shadow-[0_0_24px_rgb(141_25_26/0.55)] md:order-2"
            onClick={cross}
            disabled={locked}
            aria-keyshortcuts="Space ArrowUp"
          >
            <span className="flex flex-col items-center leading-tight md:flex-row md:gap-1.5">
              <span className="text-xs font-bold tracking-wide uppercase md:text-base">Cross</span>
              {round.nextMultiplier && <span className="tabular">{formatMult(round.nextMultiplier)}</span>}
            </span>
            <Kbd>Space</Kbd>
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary w-full py-3.5 text-base font-bold tracking-wide uppercase shadow-[0_0_28px_rgb(141_25_26/0.6)] disabled:shadow-none"
          onClick={start}
          disabled={locked || !canBet}
          aria-keyshortcuts="Space"
        >
          {done ? 'Play again' : 'Start'}
          <Kbd>Space</Kbd>
        </button>
      )
    ) : runner.running ? (
      <button type="button" className="btn btn-ghost w-full py-3" onClick={runner.stop} aria-keyshortcuts="Space">
        Stop autoplay
        <Kbd>Space</Kbd>
      </button>
    ) : (
      <button
        type="button"
        className="btn btn-primary w-full py-3 text-base font-bold shadow-[0_0_26px_rgb(141_25_26/0.55)] disabled:shadow-none"
        onClick={startAuto}
        disabled={!canBet}
        aria-keyshortcuts="Space"
      >
        Start autoplay
        <Kbd>Space</Kbd>
      </button>
    )

  return (
    <GameShell game="chicken" title="Chicken Cross" subtitle="Hop lane by lane, grow your multiplier, and cash out before the traffic gets you." rules={<Rules />}>
      <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <section className="card order-2 flex flex-col gap-4 p-4 md:order-1" aria-label="Chicken Cross controls">
          <ModeTabs value={mode} onChange={changeMode} disabled={runner.running || playing} />
          <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked || playing} />
          <div>
            <p id="chicken-difficulty" className="text-xs font-medium text-muted">
              Difficulty
            </p>
            <div role="radiogroup" aria-labelledby="chicken-difficulty" className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" onKeyDown={onDiffKey}>
              {DIFFICULTY_IDS.map((d) => (
                <button
                  key={d}
                  ref={(el) => {
                    diffRefs.current[d] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={diff === d}
                  tabIndex={diff === d ? 0 : -1}
                  disabled={locked || playing}
                  onClick={() => pickDifficulty(d)}
                  className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${diff === d ? 'bg-surface-3 text-fg shadow ring-1 ring-line-strong' : 'text-muted hover:text-fg'}`}
                >
                  <span className="block">{DIFFICULTIES[d].label}</span>
                  <span className={`block text-[10px] font-medium tabular ${diff === d ? 'text-muted' : 'text-subtle'}`}>
                    {Math.round(survival(d) * 100)}% · {DIFFICULTIES[d].lanes} lanes
                  </span>
                </button>
              ))}
            </div>
          </div>

          {mode === 'manual' ? (
            <div className="hidden md:block">{actions}</div>
          ) : (
            <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running}>
              <label className="block">
                <span className="text-xs font-medium text-muted">Cash out at lane</span>
                <select className="input mt-1.5 tabular" value={autoTarget} disabled={runner.running} onChange={(e) => setTarget(Number(e.target.value))}>
                  {mults.map((m, i) => (
                    <option key={i} value={i + 1}>
                      Lane {i + 1} · {m}×
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-subtle tabular">
                  Makes it about {Math.max(0.01, chance ** autoTarget * 100).toFixed(chance ** autoTarget < 0.1 ? 2 : 1)}% of the time.
                </span>
              </label>
              <div className="hidden md:block">{actions}</div>
            </AutoSettings>
          )}
        </section>

        <section className="card order-1 overflow-hidden md:order-2" aria-label="Road">
          <div className="space-y-3 px-3 pt-3 pb-3 sm:px-4">
            <div className="flex items-center gap-2">
              <RoundHistory items={recent} />
              <div className="flex shrink-0 gap-2">
                <FairnessButton game="chicken" />
                <SoundToggle />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                label="Multiplier"
                tone={done ? (round.result.win ? 'text-yes mc-glow-yes' : 'text-no') : playing && round.lane ? 'text-yes' : 'text-fg'}
                sub={multSub}
                bump={playing ? round.lane : undefined}
              >
                {formatMult(multShown)}
              </Stat>
              <Stat
                label={mode === 'auto' && !playing ? 'Target' : 'Next lane'}
                tone="text-fg"
                sub={mode === 'auto' && !playing ? `Lane ${autoTarget} of ${lanes}` : nextMult ? `Lane ${nextLane} of ${lanes}` : 'Finish line'}
              >
                {mode === 'auto' && !playing ? formatMult(mults[autoTarget - 1]) : nextMult ? formatMult(nextMult) : '—'}
              </Stat>
              <Stat label="Survive" sub={<span className="mn-meter mt-1.5 block" aria-hidden="true"><span className={chance >= 0.85 ? 'bg-yes' : chance >= 0.75 ? 'bg-warn' : 'bg-no'} style={{ width: `${chance * 100}%` }} /></span>}>
                {Math.round(chance * 100)}%
              </Stat>
            </div>
          </div>
          <div className="ck-progress" role="progressbar" aria-label="Lanes crossed" aria-valuemin={0} aria-valuemax={lanes} aria-valuenow={Math.round(progress * lanes)}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="relative">
            <Road
              mults={mults}
              lane={shownLane}
              statusOf={statusOf}
              crashAt={crashAt}
              ghostLane={ghostLane}
              brake={mode === 'manual' ? brake : null}
              chickenState={chickenState}
              viewH={viewH}
              lead={phone ? 1.1 : 1.5}
              quick={quick}
            />
            {result && (
              <div key={`result-${result.key}`} className="pointer-events-none absolute inset-0">
                {result.confetti && <Confetti />}
                <ResultCard result={result} className="absolute inset-x-0 top-5" />
              </div>
            )}
          </div>
          <div className="border-t border-line p-3 md:hidden">{actions}</div>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {live}
          </p>
        </section>
      </div>
    </GameShell>
  )
}
