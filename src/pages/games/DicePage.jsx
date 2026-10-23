import { useRef, useState } from 'react'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import DiceTrack, { DiceReadout } from '../../components/games/dice/DiceTrack.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import { useSpaceToPlay } from '../../components/games/limbo/fx.js'
import { Confetti, HistoryStrip } from '../../components/games/limbo/GameFx.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { clampTarget, formatRoll, MAX_TARGET, MIN_TARGET, multiplier, RTP, targetForMultiplier, winChance } from '../../games/dice.js'
import { diceSounds } from '../../games/sounds/dice.js'
import { diceDetail, rollDice } from '../../services/games/dice.js'
import { finish, holdServerPortfolio, place, useChips } from '../../store/gameStore.js'
import { useAccountStore } from '../../store/accountStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { formatCurrency } from '../../utils/format.js'
import './dice.css'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** How long the roll slides along the track, by hand and in autobet. */
const ROLL_MS = { manual: 420, quick: 110 }

/** A multiplier with 2 to 4 decimals: 2.00, 1.98, 1.0102. */
function multLabel(m) {
  const [whole, frac = ''] = m.toFixed(4).replace(/0+$/, '').split('.')
  return `${whole}.${frac.padEnd(2, '0')}`
}

const commitOnEnter = (e) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

function Rules() {
  return (
    <>
      <p>
        Each roll lands on a number from 0.00 to 100.00. Pick a target with the slider, then choose Roll Over (win when the roll is above it) or Roll Under
        (win when it is below). The smaller your win chance, the bigger the payout.
      </p>
      <p>
        The multiplier is {RTP} ÷ win chance, so every setting returns {RTP}% over the long run (a 1% house edge). A 50% chance pays 1.98×, a 10% chance
        pays 9.9×. Targets run from {MIN_TARGET} to {MAX_TARGET}.
      </p>
      <p>Auto mode repeats the bet, can raise it after a win or a loss (for example Martingale: double after every loss) and stops at a profit or loss you set.</p>
      <p>Tip: press Space to bet when you are not typing in a box. On the slider, arrow keys move the target by 1 (hold Shift for 0.1).</p>
    </>
  )
}

export default function DicePage() {
  useDocumentTitle('Games')
  const balance = useChips()
  const [betText, setBetText] = useState('10')
  const [target, setTarget] = useState(50.5)
  const [over, setOver] = useState(true)
  const [mode, setMode] = useState('manual')
  const [auto, setAuto] = useState(DEFAULT_AUTO)
  const [last, setLast] = useState(null)
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const [multText, setMultText] = useState(null)
  const [chanceText, setChanceText] = useState(null)
  const [pop, setPop] = useState(null)
  const [burst, setBurst] = useState(0)
  const runner = useAutoBet()
  const busyRef = useRef(false)

  const bet = roundMoney(Number(betText) || 0)
  const chance = winChance(target, over)
  const mult = multiplier(chance)
  const locked = busy || runner.running

  /** One roll: asks for the result, slides it along the track, reveals it, then pays. */
  const playOnce = async (amount, quick) => {
    if (!(amount >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
    const cash = useAccountStore.getState().portfolio?.cash ?? 0
    if (amount > cash + 1e-9) throw new Error(`Your balance is ${formatCurrency(cash)}.`)
    const res = await rollDice({ amount, target, over })
    const id = place({ game: 'dice', staked: amount, returned: res.payout, detail: diceDetail({ roll: res.roll, target, over, mult: res.multiplier }) })
    if (res.portfolio) holdServerPortfolio(res.portfolio)
    // The server already settled the roll; if the local balance drifted, show it and take the server's figures.
    if (!id && !res.portfolio) throw new Error('Not enough chips.')
    const key = `${res.nonce}-${Date.now()}`
    const ms = quick ? ROLL_MS.quick : ROLL_MS.manual
    setPop(null)
    // Autobet shows the color straight away instead of flickering white between rolls.
    setLast({ ...res, key, ms, revealed: quick, target, over })
    diceSounds.roll(quick)
    await sleep(ms)
    setLast((l) => (l?.key === key ? { ...l, revealed: true } : l))
    setRecent((r) => [{ roll: res.roll, win: res.win, key }, ...r].slice(0, 20))
    if (res.win) {
      diceSounds.win(res.multiplier)
      setPop({ id: key, text: `+${formatCurrency(roundMoney(res.payout - amount))}` })
      if (res.multiplier >= 10) setBurst((b) => b + 1)
    } else diceSounds.lose()
    await sleep(quick ? 60 : 160)
    if (id) finish(id)
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
    runner.start({ settings: auto, baseBet: bet, play: (amount) => playOnce(amount, true), balance: () => useAccountStore.getState().portfolio?.cash ?? 0, gapMs: 120 })
  }

  const canBet = bet >= 0.1 && bet <= balance
  useSpaceToPlay(() => {
    if (mode === 'manual') {
      if (!locked && canBet) betManual()
    } else if (runner.running) runner.stop()
    else if (canBet) startAuto()
  })

  const flip = () => {
    setOver((o) => !o)
    setTarget((t) => clampTarget(100 - t))
  }
  const setChance = (c) => {
    const v = Math.min(MAX_TARGET, Math.max(MIN_TARGET, c))
    setTarget(clampTarget(over ? 100 - v : v))
  }

  const mainButton =
    mode === 'manual' ? (
      <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={betManual} disabled={locked || !canBet}>
        {busy ? 'Rolling…' : 'Bet'}
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

  const history = recent.map((r) => ({ key: r.key, text: formatRoll(r.roll), title: r.win ? 'Win' : 'Loss', className: r.win ? 'bg-yes text-black' : 'bg-surface-3 text-muted' }))

  return (
    <GameShell game="dice" title="Dice" subtitle="Roll over or under your target. Pick any win chance from 2% to 98%." rules={<Rules />}>
      <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <section className="card order-2 flex flex-col gap-4 p-4 md:order-1" aria-label="Dice controls">
          <ModeTabs value={mode} onChange={setMode} disabled={locked} />
          <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked} />
          <div>
            <p className="text-xs font-medium text-muted">Profit on win</p>
            <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 font-semibold text-yes tabular">{formatCurrency(roundMoney(bet * mult - bet))}</p>
          </div>
          <div className="max-md:order-first">{mainButton}</div>
          {mode === 'auto' && <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running} />}
        </section>

        <section className="card order-1 min-w-0 space-y-4 p-4 sm:p-6 md:order-2" aria-label="Dice">
          <div className="flex items-center justify-between gap-3">
            <HistoryStrip items={history} label="Recent rolls" empty="Your rolls show up here." />
            <div className="pdl-tools flex shrink-0 gap-2">
              <FairnessButton game="dice" />
              <SoundToggle />
            </div>
          </div>
          <div className="dice-stage relative overflow-hidden rounded-2xl px-3 pt-5 pb-3 sm:px-6 sm:pt-6">
            {last?.revealed && <div key={last.key} className={`pointer-events-none absolute inset-0 rounded-2xl ${last.win ? 'fx-glow-win' : 'fx-glow-loss'}`} aria-hidden="true" />}
            <DiceReadout roll={last?.roll ?? null} rollKey={last?.key} revealed={last?.revealed} win={last?.win} ms={last?.ms} pop={pop} over={over} target={target} chance={chance} />
            <DiceTrack target={target} over={over} onTarget={setTarget} roll={last?.roll ?? null} rollKey={last?.key} revealed={last?.revealed} win={last?.win} disabled={locked} ms={last?.ms} />
            <Confetti burst={burst} y={30} />
          </div>
          <p className="sr-only" aria-live="polite">
            {last?.revealed ? `Rolled ${formatRoll(last.roll)}, ${last.win ? `win, ${formatCurrency(last.payout)} returned` : 'loss'}` : ''}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <label className="block min-w-0">
              <span className="text-xs font-medium text-muted">Multiplier</span>
              <div className="relative mt-1.5">
                <input
                  type="number"
                  inputMode="decimal"
                  min="1.0102"
                  max="49.5"
                  step="0.01"
                  className="input pr-6 tabular max-sm:px-2.5 max-sm:text-sm"
                  value={multText ?? multLabel(mult)}
                  disabled={locked}
                  onChange={(e) => setMultText(e.target.value)}
                  onKeyDown={commitOnEnter}
                  onBlur={() => {
                    const m = Number(multText)
                    if (m >= 1.0102 && m <= 49.5) setTarget(targetForMultiplier(m, over))
                    setMultText(null)
                  }}
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted">×</span>
              </div>
            </label>
            <div className="min-w-0">
              <span className="text-xs font-medium text-muted">{over ? 'Roll over' : 'Roll under'}</span>
              <button
                type="button"
                className="input mt-1.5 flex items-center justify-between gap-1 text-left tabular transition hover:border-line-strong disabled:opacity-60 max-sm:px-2.5 max-sm:text-sm"
                onClick={flip}
                disabled={locked}
                title="Switch between over and under"
                aria-label={`Roll ${over ? 'over' : 'under'} ${target.toFixed(2)}. Switch to roll ${over ? 'under' : 'over'}`}
              >
                {target.toFixed(2)}
                <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
                </svg>
              </button>
            </div>
            <label className="block min-w-0">
              <span className="text-xs font-medium text-muted">Win chance</span>
              <div className="relative mt-1.5">
                <input
                  type="number"
                  inputMode="decimal"
                  min={MIN_TARGET}
                  max={MAX_TARGET}
                  step="0.01"
                  className="input pr-6 tabular max-sm:px-2.5 max-sm:text-sm"
                  value={chanceText ?? chance}
                  disabled={locked}
                  onChange={(e) => setChanceText(e.target.value)}
                  onKeyDown={commitOnEnter}
                  onBlur={() => {
                    const c = Number(chanceText)
                    if (chanceText !== null && c > 0) setChance(c)
                    setChanceText(null)
                  }}
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted">%</span>
              </div>
            </label>
          </div>
        </section>
      </div>
    </GameShell>
  )
}
