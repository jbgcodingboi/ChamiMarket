import { useEffect, useMemo, useRef, useState } from 'react'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { DIFFICULTIES, DIFFICULTY_IDS, laneMultipliers, RTP, survival } from '../../games/chicken.js'
import { sounds } from '../../games/sound.js'
import { chickenApi } from '../../services/games/rounds.js'
import { useAccountStore } from '../../store/accountStore.js'
import { useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { formatCurrency } from '../../utils/format.js'

const LANE_H = 76
const CURB_H = 92
const VIEW_H = 520
const CAR_COLORS = ['#c0262d', '#2563eb', '#f5b82e', '#7c3aed', '#0d9488', '#ea580c', '#e5e7eb']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function Chicken({ state }) {
  return (
    <svg viewBox="0 0 60 60" className={`size-14 drop-shadow-[0_6px_6px_rgb(0_0_0/0.45)] ${state === 'hit' ? 'chicken-squash' : state === 'won' ? 'chicken-cheer' : ''}`} aria-hidden="true">
      <ellipse cx="30" cy="55" rx="14" ry="3" fill="rgb(0 0 0 / 0.3)" />
      <path d="M24 50v4M36 50v4M21 54h6M33 54h6" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="30" cy="36" rx="17" ry="15" fill="#fdfbf7" />
      <path d="M14 34c-4-2-6 2-4 6 2 3 6 3 8 1" fill="#f1ede4" />
      <ellipse cx="38" cy="38" rx="7" ry="5" fill="#ece6d8" />
      <circle cx="30" cy="20" r="11" fill="#fdfbf7" />
      <path d="M24 10c1-4 4-5 6-3 1-3 5-3 6 0 3-1 5 2 3 5Z" fill="#dc2626" />
      <path d="M39 20l7 2-7 3Z" fill="#f59e0b" />
      <path d="M38 26c2 2 1 5-1 6-2-1-2-4 1-6Z" fill="#dc2626" />
      <circle cx="33" cy="18" r="2" fill="#1c1917" />
      <circle cx="33.6" cy="17.4" r="0.6" fill="#fff" />
    </svg>
  )
}

function Car({ color, flip }) {
  return (
    <svg viewBox="0 0 64 34" className={`h-9 w-16 ${flip ? '-scale-x-100' : ''}`} aria-hidden="true">
      <rect x="2" y="9" width="60" height="18" rx="7" fill={color} />
      <path d="M16 9l6-7h18l8 7Z" fill={color} />
      <path d="M22 4h8v5h-11Z M33 4h6l5 5H33Z" fill="#bfdbfe" opacity="0.85" />
      <rect x="56" y="13" width="5" height="5" rx="1.5" fill="#fef08a" />
      <rect x="3" y="13" width="3" height="5" rx="1" fill="#f87171" />
      <circle cx="16" cy="28" r="5" fill="#18181b" />
      <circle cx="48" cy="28" r="5" fill="#18181b" />
      <circle cx="16" cy="28" r="2" fill="#71717a" />
      <circle cx="48" cy="28" r="2" fill="#71717a" />
    </svg>
  )
}

/** One lane of road: traffic while it's ahead, a barrier once crossed, the multiplier on its manhole. */
function Lane({ index, mult, status, crash }) {
  const n = index + 1
  const dir = n % 2 ? 'r' : 'l'
  const speed = 2.6 + ((n * 37) % 23) / 10
  const cars = [0, 1].map((k) => ({ color: CAR_COLORS[(n * 3 + k) % CAR_COLORS.length], delay: -((n * 1.7 + k * speed * 0.52) % speed) }))
  return (
    <div
      className={`relative border-b-2 border-dashed border-white/15 ${status === 'passed' ? 'bg-[#2a2614]' : status === 'current' ? 'bg-[#13321f]' : 'bg-[#1d1d22]'}`}
      style={{ height: LANE_H }}
      data-lane={n}
    >
      {status === 'ahead' && !crash &&
        cars.map((c, k) => (
          <div key={k} className={`chicken-car drive-${dir} absolute top-1/2 -translate-y-1/2`} style={{ animationDuration: `${speed}s`, animationDelay: `${c.delay}s` }}>
            <Car color={c.color} flip={dir === 'l'} />
          </div>
        ))}
      {crash && (
        <div className={`absolute top-1/2 -translate-y-1/2 crash-in-${dir}`}>
          <Car color="#dc2626" flip={dir === 'l'} />
        </div>
      )}
      {(status === 'passed' || status === 'current') && (
        <div className="absolute inset-x-0 top-1 flex justify-center gap-1 opacity-80" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <span key={k} className="h-1.5 w-5 rounded-sm bg-[repeating-linear-gradient(90deg,#f5b82e_0_6px,#18181b_6px_12px)]" />
          ))}
        </div>
      )}
      <div className="absolute top-1/2 left-1/2 z-[2] -translate-x-1/2 -translate-y-1/2">
        <span
          className={`flex size-14 items-center justify-center rounded-full border-4 text-xs font-bold tabular shadow-inner transition ${
            status === 'passed' ? 'border-warn/80 bg-warn/25 text-warn' : status === 'current' ? 'border-yes bg-yes/25 text-yes' : 'border-white/15 bg-black/35 text-white/85'
          }`}
        >
          {mult}×
        </span>
      </div>
    </div>
  )
}

function Feathers() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="feather absolute top-1/2 left-1/2 h-2.5 w-1.5 rounded-full bg-white" style={{ '--fx': `${Math.cos(i * 0.63) * 70}px`, '--fy': `${Math.sin(i * 0.63) * 60 - 30}px`, '--fr': `${i * 47}deg` }} />
      ))}
    </div>
  )
}

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
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)
  const runner = useAutoBet()
  const busyRef = useRef(false)

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
  const diff = playing || round.phase === 'done' ? round.difficulty : difficulty
  const mults = useMemo(() => laneMultipliers(diff), [diff])
  const lanes = mults.length
  const locked = busy || runner.running
  const offset = Math.max(0, Math.min(CURB_H + lanes * LANE_H + 60 - VIEW_H, shownLane * LANE_H - LANE_H * 1.5))

  const reset = () => {
    setCrashAt(null)
    setBanner(null)
    setShownLane(0)
  }

  /** Plays out a finished round on the road: hops to where it ended, then the win or the crash. */
  const animateTo = async (r, fromLane, quick) => {
    const end = r.result.win ? r.result.lane : r.result.hitLane
    for (let l = fromLane + 1; l <= end; l++) {
      setShownLane(l)
      sounds.hop()
      await sleep(quick ? 140 : 260)
    }
    if (r.result.win) {
      sounds.win()
      setBanner({ win: true, text: `+${formatCurrency(r.result.payout)}`, sub: `${r.result.multiplier}×` })
    } else {
      setCrashAt(r.result.hitLane)
      await sleep(260)
      sounds.squash()
      setBanner({ win: false, text: 'Round over', sub: '0.00×' })
    }
  }

  const run = async (fn) => {
    if (busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    try {
      return await fn()
    } catch (err) {
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
      reset()
      const r = await chickenApi.start({ amount: bet, difficulty })
      setRound(r)
      sounds.click()
    })

  const cross = () =>
    run(async () => {
      const from = round.lane
      const r = await chickenApi.step()
      setRound(r)
      if (r.phase === 'playing') {
        setShownLane(r.lane)
        sounds.hop()
      } else await animateTo(r, from, false)
    })

  const cashout = () =>
    run(async () => {
      const r = await chickenApi.cashout()
      setRound(r)
      sounds.win()
      setBanner({ win: true, text: `+${formatCurrency(r.result.payout)}`, sub: `${r.result.multiplier}×` })
    })

  const startAuto = () => {
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    runner.start({
      settings: auto,
      baseBet: bet,
      balance: () => useAccountStore.getState().portfolio?.cash ?? 0,
      gapMs: 700,
      play: async (amount) => {
        reset()
        const r = await chickenApi.auto({ amount, difficulty, target: Math.min(target, lanes) })
        setRound(r)
        await animateTo(r, 0, true)
        return { net: roundMoney(r.result.payout - amount) }
      },
    })
  }

  const statusOf = (n) => (n < shownLane ? 'passed' : n === shownLane ? 'current' : 'ahead')
  const chickenState = crashAt ? 'hit' : banner?.win ? 'won' : 'idle'

  return (
    <GameShell game="chicken" title="Chicken Cross" subtitle="Hop lane by lane, grow your multiplier, and cash out before the traffic gets you." rules={<Rules />}>
      <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <section className="card order-2 flex flex-col gap-4 p-4 md:order-1" aria-label="Chicken Cross controls">
          <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked || playing} />
          <div>
            <p className="text-xs font-medium text-muted">Difficulty</p>
            <div role="radiogroup" aria-label="Difficulty" className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
              {DIFFICULTY_IDS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={diff === d}
                  disabled={locked || playing}
                  onClick={() => setDifficulty(d)}
                  className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${diff === d ? 'bg-surface-3 text-fg shadow' : 'text-muted hover:text-fg'}`}
                >
                  {DIFFICULTIES[d].label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'manual' ? (
            playing ? (
              <div className="space-y-2">
                <button
                  type="button"
                  className="btn w-full bg-yes py-3.5 text-base font-bold tracking-wide text-black uppercase shadow-[0_0_28px_rgb(47_191_113/0.5)] hover:bg-yes-strong disabled:opacity-50"
                  onClick={cashout}
                  disabled={locked || round.lane < 1}
                >
                  {round.lane ? `Cash out ${formatCurrency(round.payout)}` : 'Cash out'}
                </button>
                <button type="button" className="btn btn-primary w-full py-3 text-base font-bold tracking-wide uppercase" onClick={cross} disabled={locked}>
                  Cross{round.nextMultiplier ? ` · ${round.nextMultiplier}×` : ''}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary w-full py-3.5 text-base font-bold tracking-wide uppercase shadow-[0_0_28px_rgb(141_25_26/0.6)]"
                onClick={start}
                disabled={locked || !(bet >= 0.1) || bet > balance}
              >
                Start
              </button>
            )
          ) : (
            <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running}>
              <label className="block">
                <span className="text-xs font-medium text-muted">Cash out at lane</span>
                <select className="input mt-1.5 tabular" value={Math.min(target, lanes)} disabled={runner.running} onChange={(e) => setTarget(Number(e.target.value))}>
                  {mults.map((m, i) => (
                    <option key={i} value={i + 1}>
                      Lane {i + 1} · {m}×
                    </option>
                  ))}
                </select>
              </label>
              {runner.running ? (
                <button type="button" className="btn btn-ghost w-full py-3" onClick={runner.stop}>
                  Stop autoplay
                </button>
              ) : (
                <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={startAuto} disabled={!(bet >= 0.1) || bet > balance}>
                  Start autoplay
                </button>
              )}
            </AutoSettings>
          )}
          <div className="mt-auto">
            <ModeTabs value={mode} onChange={setMode} disabled={runner.running || playing} />
          </div>
        </section>

        <section className="card order-1 overflow-hidden md:order-2" aria-label="Road">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-sm">
            <span className="tabular" aria-live="polite">
              {playing ? (
                <>
                  Lane <strong>{round.lane}</strong> of {lanes} · <strong className="text-yes">{round.multiplier}×</strong>
                </>
              ) : (
                <span className="text-muted">
                  {lanes} lanes · up to {mults.at(-1).toLocaleString('en-US')}×
                </span>
              )}
            </span>
            <div className="flex shrink-0 gap-2">
              <FairnessButton game="chicken" locked={playing} />
              <SoundToggle />
            </div>
          </div>
          <div className="relative overflow-hidden bg-[#141417] [perspective:1100px]" style={{ height: VIEW_H }}>
            <div className="origin-bottom [transform:rotateX(14deg)]" style={{ height: VIEW_H }}>
              <div className="absolute inset-x-0 bottom-0 transition-transform duration-300 ease-out" style={{ transform: `translateY(${offset}px)` }}>
                <div className="flex h-14 items-center justify-center bg-[repeating-linear-gradient(90deg,#fdfbf7_0_18px,#18181b_18px_36px)] text-xs font-bold tracking-[0.3em] text-black/0" aria-hidden="true" />
                <div className="flex flex-col-reverse">
                  {mults.map((m, i) => (
                    <Lane key={`${diff}-${i}`} index={i} mult={m} status={statusOf(i + 1)} crash={crashAt === i + 1} />
                  ))}
                </div>
                <div className="flex items-center justify-center bg-[#2b2b31] text-[11px] font-semibold tracking-[0.25em] text-white/50 uppercase" style={{ height: CURB_H }}>
                  Start
                </div>
                <div
                  className="absolute left-1/2 z-10 -translate-x-1/2 transition-[bottom] duration-200 ease-out"
                  style={{ bottom: shownLane === 0 ? CURB_H / 2 - 28 : CURB_H + (shownLane - 1) * LANE_H + LANE_H / 2 - 24 }}
                >
                  <div key={shownLane} className={shownLane ? 'chicken-hop' : ''}>
                    <Chicken state={chickenState} />
                  </div>
                  {crashAt && <Feathers />}
                </div>
              </div>
            </div>
            {banner && (
              <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
                <div className={`rounded-2xl border-2 px-6 py-3 text-center shadow-2xl animate-scale-in ${banner.win ? 'border-yes bg-black/80' : 'border-no bg-black/80'}`}>
                  <p className={`text-2xl font-bold tabular ${banner.win ? 'text-yes' : 'text-no'}`}>{banner.text}</p>
                  <p className="text-xs text-white/70 tabular">{banner.sub}</p>
                </div>
              </div>
            )}
            {round.phase === 'done' && !banner && <div className="pointer-events-none absolute inset-0 bg-black/30" />}
          </div>
        </section>
      </div>
    </GameShell>
  )
}
