import { useRef, useState } from 'react'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { clampTarget, formatRoll, MAX_TARGET, MIN_TARGET, multiplier, RTP, targetForMultiplier, winChance } from '../../games/dice.js'
import { sounds } from '../../games/sound.js'
import { diceDetail, rollDice } from '../../services/games/dice.js'
import { finish, holdServerPortfolio, place, useChips } from '../../store/gameStore.js'
import { useAccountStore } from '../../store/accountStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { formatCurrency } from '../../utils/format.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
    </>
  )
}

/** The 0 to 100 track: red loses, green wins, the handle sets the target and the marker shows the roll. */
function DiceTrack({ target, over, onTarget, roll, win, disabled }) {
  const pct = (v) => `${v}%`
  const rollPct = roll === null ? null : roll / 100
  return (
    <div className="px-2 pt-14 pb-6">
      <div className="relative h-3">
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <div className={over ? 'bg-no' : 'bg-yes'} style={{ width: pct(target) }} />
          <div className={`flex-1 ${over ? 'bg-yes' : 'bg-no'}`} />
        </div>
        {rollPct !== null && (
          <div
            className="absolute -top-14 -translate-x-1/2 transition-[left] duration-300 ease-out"
            style={{ left: pct(rollPct) }}
            aria-live="polite"
            aria-label={`Rolled ${formatRoll(roll)}, ${win ? 'win' : 'loss'}`}
          >
            <div
              className={`flex h-10 min-w-16 items-center justify-center rounded-xl px-2 font-mono text-sm font-bold text-black shadow-lg animate-chip-pop ${win ? 'bg-yes' : 'bg-no'}`}
              key={roll}
            >
              {formatRoll(roll)}
            </div>
            <div className={`mx-auto size-0 border-x-8 border-t-8 border-x-transparent ${win ? 'border-t-yes' : 'border-t-no'}`} />
          </div>
        )}
        <input
          type="range"
          min={MIN_TARGET}
          max={MAX_TARGET}
          step="0.01"
          value={target}
          disabled={disabled}
          onChange={(e) => onTarget(clampTarget(Number(e.target.value)))}
          aria-label={`Target: roll ${over ? 'over' : 'under'}`}
          className="dice-range absolute inset-x-0 -top-2 h-7 w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted tabular">
        {[0, 25, 50, 75, 100].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
    </div>
  )
}

export default function DicePage() {
  useDocumentTitle('Dice')
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
  const runner = useAutoBet()
  const busyRef = useRef(false)

  const bet = roundMoney(Number(betText) || 0)
  const chance = winChance(target, over)
  const mult = multiplier(chance)
  const locked = busy || runner.running

  /** One roll: asks for the result, shows it on the track, then pays. */
  const playOnce = async (amount, quick) => {
    if (!(amount >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
    const cash = useAccountStore.getState().portfolio?.cash ?? 0
    if (amount > cash + 1e-9) throw new Error(`Your balance is ${formatCurrency(cash)}.`)
    const res = await rollDice({ amount, target, over })
    const id = place({ game: 'dice', staked: amount, returned: res.payout, detail: diceDetail({ roll: res.roll, target, over, mult: res.multiplier }) })
    if (res.portfolio) holdServerPortfolio(res.portfolio)
    // The server already settled the roll; if the local balance drifted, show it and take the server's figures.
    if (!id && !res.portfolio) throw new Error('Not enough chips.')
    setLast(res)
    setRecent((r) => [{ roll: res.roll, win: res.win, key: `${res.nonce}-${Date.now()}` }, ...r].slice(0, 12))
    if (res.win) sounds.gem()
    else sounds.click()
    await sleep(quick ? 180 : 320)
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
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    runner.start({ settings: auto, baseBet: bet, play: (amount) => playOnce(amount, true), balance: () => useAccountStore.getState().portfolio?.cash ?? 0, gapMs: 120 })
  }

  const flip = () => {
    setOver((o) => !o)
    setTarget((t) => clampTarget(100 - t))
  }
  const setChance = (c) => {
    const v = Math.min(MAX_TARGET, Math.max(MIN_TARGET, c))
    setTarget(clampTarget(over ? 100 - v : v))
  }

  return (
    <GameShell game="dice" title="Dice" subtitle="Roll over or under your target. Pick any win chance from 2% to 98%." rules={<Rules />}>
      <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <section className="card order-2 space-y-4 p-4 md:order-1" aria-label="Dice controls">
          <ModeTabs value={mode} onChange={setMode} disabled={runner.running} />
          <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked} />
          <div>
            <p className="text-xs font-medium text-muted">Profit on win</p>
            <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 font-semibold text-yes tabular">{formatCurrency(roundMoney(bet * mult - bet))}</p>
          </div>
          {mode === 'manual' ? (
            <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={betManual} disabled={locked || !(bet >= 0.1) || bet > balance}>
              {busy ? 'Rolling…' : 'Bet'}
            </button>
          ) : (
            <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running}>
              {runner.running ? (
                <button type="button" className="btn btn-ghost w-full py-3" onClick={runner.stop}>
                  Stop autobet
                </button>
              ) : (
                <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={startAuto} disabled={!(bet >= 0.1) || bet > balance}>
                  Start autobet
                </button>
              )}
            </AutoSettings>
          )}
        </section>

        <section className="card order-1 space-y-5 p-4 sm:p-6 md:order-2" aria-label="Dice">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-h-8 flex-wrap gap-1.5" aria-label="Recent rolls">
              {recent.map((r, i) => (
                <span key={r.key} className={`rounded-md px-2 py-1 font-mono text-xs font-bold ${i === 0 ? 'animate-chip-pop' : ''} ${r.win ? 'bg-yes text-black' : 'bg-surface-3 text-muted'}`}>
                  {formatRoll(r.roll)}
                </span>
              ))}
            </div>
            <div className="flex shrink-0 gap-2">
              <FairnessButton game="dice" />
              <SoundToggle />
            </div>
          </div>
          <DiceTrack target={target} over={over} onTarget={setTarget} roll={last?.roll ?? null} win={last?.win} disabled={locked} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium text-muted">Multiplier</span>
              <div className="relative mt-1.5">
                <input
                  type="number"
                  min="1.0102"
                  max="49.5"
                  step="0.01"
                  className="input pr-7 tabular"
                  value={multText ?? mult}
                  disabled={locked}
                  onChange={(e) => setMultText(e.target.value)}
                  onBlur={() => {
                    const m = Number(multText)
                    if (m >= 1.0102 && m <= 49.5) setTarget(targetForMultiplier(m, over))
                    setMultText(null)
                  }}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">×</span>
              </div>
            </label>
            <div>
              <span className="text-xs font-medium text-muted">{over ? 'Roll over' : 'Roll under'}</span>
              <button type="button" className="input mt-1.5 flex items-center justify-between text-left tabular" onClick={flip} disabled={locked} title="Switch between over and under">
                {target.toFixed(2)}
                <svg viewBox="0 0 24 24" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
                </svg>
              </button>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-muted">Win chance</span>
              <div className="relative mt-1.5">
                <input
                  type="number"
                  min={MIN_TARGET}
                  max={MAX_TARGET}
                  step="0.01"
                  className="input pr-7 tabular"
                  value={chance}
                  disabled={locked}
                  onChange={(e) => setChance(Number(e.target.value) || MIN_TARGET)}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>
              </div>
            </label>
          </div>
        </section>
      </div>
    </GameShell>
  )
}
