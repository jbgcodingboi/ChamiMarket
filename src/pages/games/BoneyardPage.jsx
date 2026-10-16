import { useRef, useState } from 'react'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { CAP_X, HIGH_NOON_SPINS, LAST_RITES_SPINS, PAY, PAYING, REEL_MID, ROWS, SYMBOL_NAME } from '../../games/boneyard.js'
import { sounds } from '../../games/sound.js'
import { bonusName, boneyardDetail, spinBoneyard } from '../../services/games/boneyard.js'
import { useAccountStore } from '../../store/accountStore.js'
import { finish, holdServerPortfolio, place, useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { formatCurrency } from '../../utils/format.js'
import { roundMoney } from '../../utils/math.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const cash = () => useAccountStore.getState().portfolio?.cash ?? 0

/** How each symbol looks on a tile. */
const LOOK = {
  jack: { text: 'J', cls: 'text-sky-300' },
  queen: { text: 'Q', cls: 'text-violet-300' },
  king: { text: 'K', cls: 'text-emerald-300' },
  ace: { text: 'A', cls: 'text-rose-300' },
  gambler: { text: '🃏', cls: '' },
  undertaker: { text: '🎩', cls: '' },
  outlaw: { text: '🤠', cls: '' },
  sheriff: { text: '⭐', cls: '' },
  wild: { text: 'WILD', cls: 'text-[11px] font-black tracking-wider text-amber-300' },
  split: { text: 'SPLIT', cls: 'text-[10px] font-black tracking-wider text-fuchsia-300' },
  scatter: { text: '💀', cls: '' },
  coffin: { text: '⚰️', cls: '' },
}
const FILLER = REEL_MID.symbols.filter((s) => s !== 'scatter')

function Tile({ symbol, split, hot, spinning, transformed }) {
  const look = LOOK[symbol] ?? { text: '?', cls: '' }
  const special = symbol === 'wild' || symbol === 'split' || transformed
  return (
    <div
      className={`relative flex h-14 items-center justify-center rounded-lg border text-2xl font-black sm:h-16 sm:text-3xl ${
        special ? 'border-amber-400/60 bg-amber-500/15' : 'border-white/10 bg-black/30'
      } ${hot ? 'ring-2 ring-yes' : ''} ${spinning ? 'opacity-60 blur-[1px]' : ''}`}
      aria-label={`${SYMBOL_NAME[symbol] ?? symbol}${split ? ', split' : ''}${transformed ? ', turned wild' : ''}`}
    >
      <span className={look.cls}>{look.text}</span>
      {split && <span className="absolute top-0.5 right-1 rounded bg-fuchsia-500/80 px-1 text-[9px] font-bold text-white">×2</span>}
      {transformed && <span className="absolute bottom-0.5 left-1 text-[9px] font-bold text-amber-300">WILD</span>}
    </div>
  )
}

/** The 2-3-3-3-1 grid. Nudge Wild reels show as one tall wild with their multiplier. */
function Grid({ spin, spinning }) {
  const hot = new Set(spin?.wins.map((w) => w.symbol) ?? [])
  return (
    <div className="grid grid-cols-5 items-center gap-1.5 sm:gap-2" role="group" aria-label="Reels">
      {ROWS.map((n, r) => {
        const cells = spin?.reels[r] ?? Array.from({ length: n }, (_, i) => FILLER[(r * 3 + i * 5) % FILLER.length])
        const nudge = spin?.nudges[r]
        if (nudge && !spinning[r]) {
          return (
            <div
              key={r}
              className="relative flex h-[10.75rem] flex-col items-center justify-center rounded-lg border border-amber-400/70 bg-gradient-to-b from-amber-500/30 to-amber-700/20 sm:h-[12.5rem]"
              aria-label={`Nudge Wild, ${nudge.mult}× multiplier`}
            >
              <span className="text-[11px] font-black tracking-wider text-amber-300">NUDGE</span>
              <span className="text-[11px] font-black tracking-wider text-amber-300">WILD</span>
              <span className="mt-2 rounded-full bg-amber-400 px-2 py-0.5 text-sm font-black text-black">{nudge.mult}×</span>
            </div>
          )
        }
        return (
          <div key={r} className="space-y-1.5 sm:space-y-2">
            {cells.map((sym, row) => (
              <Tile
                key={row}
                symbol={spinning[r] ? FILLER[(row + r + spinning[r]) % FILLER.length] : sym}
                split={!spinning[r] && spin?.splitRow === row && r < 4}
                hot={!spinning[r] && (hot.has(sym) || sym === 'wild' || sym === 'split') && hot.size > 0}
                transformed={!spinning[r] && spin?.cowboy === sym}
                spinning={Boolean(spinning[r])}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Rules() {
  return (
    <>
      <p>
        Five reels with 2, 3, 3, 3 and 1 rows. Wins pay left to right on adjacent reels, 3 or more, on every way: the ways for a symbol are how many times it
        shows on each reel multiplied together (54 ways on a plain spin). Pays are per way, as a share of your bet:
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
        {PAYING.map((s) => (
          <li key={s}>
            <span className="font-semibold text-fg">{SYMBOL_NAME[s]}</span> {PAY[s].map((u) => `${u / 100}×`).join(' / ')}
          </li>
        ))}
      </ul>
      <p>
        <span className="font-semibold text-fg">Nudge Wilds</span> (reels 2 to 4) nudge to fill the reel, and each step adds 1 to their multiplier. Multipliers
        of Nudge Wilds on a win add together. <span className="font-semibold text-fg">Split Wilds</span> (reel 5) count twice and split one row of the reels
        to their left: split symbols count twice and a split Nudge Wild doubles its multiplier.
      </p>
      <p>
        <span className="font-semibold text-fg">R.I.P. rule:</span> in the base game, a total win smaller than your bet pays nothing.
      </p>
      <p>
        <span className="font-semibold text-fg">High Noon:</span> 3 or more 💀 start {HIGH_NOON_SPINS} free spins with a global multiplier that grows by 1 for
        every wild that lands and never resets. <span className="font-semibold text-fg">Last Rites:</span> 3 or more 💀 with a ⚰️ on reel 5 start{' '}
        {LAST_RITES_SPINS} free spins that also turn one character into wilds every spin and give another a random 5× to 999× multiplier.
      </p>
      <p>
        A round never pays more than {CAP_X.toLocaleString('en-US')}× your bet. The long-run return is about 96%, from a lot of small losses and rare huge
        wins, so swings are big. Every round is provably fair.
      </p>
    </>
  )
}

export default function BoneyardPage() {
  useDocumentTitle('Boneyard')
  const balance = useChips()
  const [betText, setBetText] = useState('1')
  const [mode, setMode] = useState('manual')
  const [auto, setAuto] = useState(DEFAULT_AUTO)
  const [spin, setSpin] = useState(null)
  const [spinning, setSpinning] = useState([0, 0, 0, 0, 0])
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const runner = useAutoBet()
  const busyRef = useRef(false)
  const bet = roundMoney(Number(betText) || 0)
  const locked = busy || runner.running

  /** Shows one spin: reels blur, then stop left to right. */
  const showSpin = async (s, quick) => {
    for (let tick = 1; tick <= (quick ? 3 : 6); tick++) {
      setSpinning([tick, tick, tick, tick, tick])
      await sleep(60)
    }
    for (let r = 0; r < 5; r++) {
      setSpin(s)
      setSpinning((prev) => prev.map((v, i) => (i <= r ? 0 : v + 1)))
      sounds.click()
      await sleep(quick ? 40 : 110)
    }
  }

  const playOnce = async (amount, quick) => {
    if (!(amount >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
    if (amount > cash() + 1e-9) throw new Error(`Your balance is ${formatCurrency(cash())}.`)
    const res = await spinBoneyard({ amount })
    const { round } = res
    const id = place({ game: 'boneyard', staked: amount, returned: res.payout, detail: boneyardDetail(round) })
    if (res.portfolio) holdServerPortfolio(res.portfolio)
    if (!id && !res.portfolio) throw new Error('Not enough chips.')
    setStatus(null)
    const base = round.spins[0]
    await showSpin(base, quick)
    let total = base.units
    if (base.rip) setStatus({ tone: 'no', text: 'R.I.P. A win smaller than your bet pays nothing.' })
    else if (base.units > 0) setStatus({ tone: 'yes', text: `Win ${formatCurrency((amount * base.units) / 100)}` })
    else setStatus({ tone: 'muted', text: 'No win' })
    if (round.bonus) {
      sounds.win()
      setStatus({ tone: 'gold', text: `${bonusName(round.bonus)}! ${round.spins.length - 1} spins` })
      await sleep(quick ? 400 : 1200)
      for (let i = 1; i < round.spins.length; i++) {
        const s = round.spins[i]
        await showSpin(s, quick)
        total += s.units
        const extra = s.cowboy ? ` · ${SYMBOL_NAME[s.cowboy]} wild · ${SYMBOL_NAME[s.random.symbol]} ×${s.random.value}` : ''
        setStatus({
          tone: 'gold',
          text: `Free spin ${i} of ${round.bonus === 'last-rites' ? LAST_RITES_SPINS : HIGH_NOON_SPINS} · multiplier ${s.global}×${extra} · total ${formatCurrency(
            Math.min((amount * total) / 100, res.payout),
          )}`,
        })
        if (s.units > 0) sounds.gem()
        await sleep(quick ? 250 : 650)
      }
    }
    if (res.payout > 0 && (round.bonus || !base.rip)) {
      setStatus({ tone: 'yes', text: `${round.capped ? 'Max win! ' : ''}Won ${formatCurrency(res.payout)} (${(round.units / 100).toFixed(2)}×)` })
      if (round.units >= 2000) sounds.win()
    }
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

  const startAuto = () => {
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    runner.start({ settings: auto, baseBet: bet, play: (amount) => playOnce(amount, true), balance: cash, gapMs: 150 })
  }

  const tone = { yes: 'text-yes', no: 'text-no', gold: 'text-amber-300', muted: 'text-muted' }
  return (
    <GameShell game="boneyard" title="Boneyard" subtitle={`A high-volatility western ways slot. Up to ${CAP_X.toLocaleString('en-US')}× your bet.`} rules={<Rules />}>
      <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <section className="card order-2 space-y-4 p-4 md:order-1" aria-label="Boneyard controls">
          <ModeTabs value={mode} onChange={setMode} disabled={runner.running} />
          <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked} />
          {mode === 'manual' ? (
            <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={spinManual} disabled={locked || !(bet >= 0.1) || bet > balance}>
              {busy ? 'Spinning…' : 'Spin'}
            </button>
          ) : (
            <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running}>
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
        </section>

        <section className="card order-1 space-y-4 p-4 sm:p-6 md:order-2" aria-label="Boneyard">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted">
              {spin && spin.global > 1 ? `Free spins multiplier ${spin.global}×` : `54 ways and up · max win ${CAP_X.toLocaleString('en-US')}×`}
            </p>
            <div className="flex shrink-0 gap-2">
              <FairnessButton game="boneyard" />
              <SoundToggle />
            </div>
          </div>
          <div className="felt rounded-2xl p-3 sm:p-4">
            <Grid spin={spin} spinning={spinning} />
          </div>
          <p className={`min-h-6 text-center text-sm font-semibold ${status ? tone[status.tone] : 'text-muted'}`} aria-live="polite">
            {status?.text ?? 'Spin to play. 3 💀 start the free spins.'}
          </p>
        </section>
      </div>
    </GameShell>
  )
}
