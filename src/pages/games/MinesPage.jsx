import { useEffect, useRef, useState } from 'react'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import { Confetti, Kbd, ResultCard, RoundHistory, Stat } from '../../components/games/mines/CasinoUI.jsx'
import { formatMult, useCountUp, useHotkeys, useRecentRounds } from '../../components/games/mines/hooks.js'
import MinesTile from '../../components/games/mines/MinesTile.jsx'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { maxGems, multiplier, nextSafeChance, TILES } from '../../games/mines.js'
import { minesSounds } from '../../games/sounds/mines.js'
import { minesApi } from '../../services/games/rounds.js'
import { useAccountStore } from '../../store/accountStore.js'
import { finish, useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { formatCurrency } from '../../utils/format.js'
import './mines.css'

const MINE_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1)
const MINE_PRESETS = [1, 3, 5, 10, 24]
const BIG_WIN = 5

const rowCol = (i) => [Math.floor(i / 5), i % 5]
const ringDistance = (a, b) => {
  const [r1, c1] = rowCol(a)
  const [r2, c2] = rowCol(b)
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2))
}

function Rules() {
  return (
    <>
      <p>
        Twenty-five tiles hide gems and mines. Pick how many mines (1 to 24), place your bet, then open tiles. Every gem raises your multiplier; cash out
        whenever you like. Hit a mine and the round ends and the bet is lost.
      </p>
      <p>
        The multiplier after each gem is 0.99 ÷ the chance of getting that far without a mine, so the game returns 99% over the long run. More mines means
        bigger jumps: with 1 mine a gem pays 1.03×, with 24 mines a single gem pays 24.75×.
      </p>
      <p>Auto mode plays the same tiles every round and cashes out when they are all gems. You can also set an automatic cash out in manual play.</p>
      <p>Keyboard: Space places a bet, then opens a random tile; C cashes out. In auto mode Space starts and stops autobet.</p>
    </>
  )
}

export default function MinesPage() {
  useDocumentTitle('Mines')
  const balance = useChips()
  const [betText, setBetText] = useState('10')
  const [mines, setMines] = useState(3)
  const [mode, setMode] = useState('manual')
  const [auto, setAuto] = useState(DEFAULT_AUTO)
  const [round, setRound] = useState({ phase: 'idle' })
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [picked, setPicked] = useState([])
  const [autoCash, setAutoCash] = useState('')
  const [result, setResult] = useState(null)
  const [live, setLive] = useState('')
  const runner = useAutoBet()
  const busyRef = useRef(false)
  const recent = useRecentRounds('mines')

  useEffect(() => {
    minesApi
      .state()
      .then((r) => {
        if (!r || r.phase === 'idle') return
        setRound(r)
        if (r.mines) setMines(r.mines)
        if (r.bet) setBetText(String(r.bet))
      })
      .catch(() => {})
  }, [])

  const bet = roundMoney(Number(betText) || 0)
  const playing = round.phase === 'playing'
  const done = round.phase === 'done'
  const boardMines = playing || done ? round.mines : mines
  const locked = busy || runner.running
  const canBet = bet >= 0.1 && bet <= balance

  const act = async (fn) => {
    if (busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    try {
      const r = await fn()
      setRound(r)
      return r
    } catch (err) {
      toast({ tone: 'error', title: 'Move not accepted', description: err.message })
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  /** Sound, result card and screen-reader line for a finished round. */
  const announce = (r, quiet = false) => {
    if (r?.phase !== 'done') return
    const { win, payout, multiplier: mult } = r.result
    if (win) {
      if (!quiet || mult >= BIG_WIN) minesSounds.cashout(mult)
      setResult({ key: r.nonce, win: true, payout, mult, title: mult >= BIG_WIN ? 'Big win' : 'You won', confetti: mult >= (quiet ? BIG_WIN * 2 : BIG_WIN) })
      setLive(`Cashed out ${formatCurrency(payout)} at ${formatMult(mult)}.`)
    } else {
      minesSounds.boom()
      setResult({ key: r.nonce, win: false, title: 'Mine hit', sub: `-${formatCurrency(r.bet)}` })
      setLive(`Mine on tile ${r.result.hit + 1}. Bet of ${formatCurrency(r.bet)} lost.`)
    }
  }

  const start = async () => {
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    if (bet > balance) return toast({ tone: 'error', title: 'Not enough funds for this bet' })
    setResult(null)
    const r = await act(() => minesApi.start({ amount: bet, mines }))
    if (r) {
      minesSounds.start()
      setLive(`Bet placed with ${r.mines} mines. Pick a tile.`)
    }
  }

  const reveal = async (tile) => {
    if (!playing || locked || round.revealed.includes(tile)) return
    setPending(tile)
    const r = await act(() => minesApi.reveal(tile))
    setPending(null)
    if (!r) return
    if (r.phase === 'playing') {
      minesSounds.gem(r.gems)
      setLive(`Gem. ${formatMult(r.multiplier)}, cash out ${formatCurrency(r.payout)}.`)
      const target = Number(autoCash)
      if (target >= 1 && r.gems >= target) announce(await act(() => minesApi.cashout()))
    } else {
      if (r.result.win) minesSounds.gem(r.gems)
      announce(r)
    }
  }

  const cashout = async () => {
    if (!playing || locked || round.gems < 1) return
    announce(await act(() => minesApi.cashout()))
  }

  const randomTile = () => {
    if (!playing || locked) return
    const free = Array.from({ length: TILES }, (_, i) => i).filter((i) => !round.revealed.includes(i))
    const pick = new Uint32Array(1)
    globalThis.crypto.getRandomValues(pick)
    reveal(free[pick[0] % free.length])
  }

  /** Clears a finished round off the board so new settings and auto picks can be seen. */
  const clearBoard = () => {
    if (round.phase === 'done') {
      setRound({ phase: 'idle' })
      setResult(null)
    }
  }

  const changeMode = (m) => {
    setMode(m)
    if (m === 'auto') clearBoard()
  }

  const changeMines = (n) => {
    setMines(n)
    setPicked([])
    clearBoard()
  }

  const togglePick = (tile) => {
    if (runner.running) return
    clearBoard()
    setPicked((p) => {
      if (p.includes(tile)) {
        minesSounds.pick(false)
        return p.filter((t) => t !== tile)
      }
      if (p.length >= maxGems(mines)) return p
      minesSounds.pick(true)
      return [...p, tile]
    })
  }

  const startAuto = () => {
    if (busyRef.current) return
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    if (!picked.length) return toast({ tone: 'info', title: 'Pick tiles first', description: 'Click the tiles you want to open every round.' })
    setResult(null)
    runner.start({
      settings: auto,
      baseBet: bet,
      balance: () => useAccountStore.getState().portfolio?.cash ?? 0,
      gapMs: 650,
      play: async (amount) => {
        const r = await minesApi.auto({ amount, mines, tiles: picked })
        setRound(r)
        announce(r, true)
        // Pay out once the picks have turned over (well inside the gap before the next round).
        setTimeout(() => finish(r.holdId), 420)
        return { net: roundMoney(r.result.payout - amount) }
      },
    })
  }

  useHotkeys(
    mode === 'manual'
      ? {
          ' ': () => (playing ? randomTile() : !locked && canBet && start()),
          c: cashout,
        }
      : { ' ': () => (runner.running ? runner.stop() : canBet && startAuto()) },
  )

  // Board ------------------------------------------------------------------
  const revealed = round.revealed ?? []
  const hit = done ? round.result.hit : null
  /** A round that arrived finished (auto play) turns its picks over in order; otherwise only the rest of the board flips. */
  const instant = done && mode === 'auto'
  const step = instant ? Math.min(32, 260 / Math.max(1, revealed.length)) : 0
  const origin = hit ?? revealed.at(-1) ?? 12

  const tileState = (i) => {
    if (done) {
      if (hit === i) return 'hit'
      if (revealed.includes(i)) return 'gem'
      return round.result.positions?.includes(i) ? 'mine-dim' : 'gem-dim'
    }
    return revealed.includes(i) ? 'gem' : 'hidden'
  }
  const delayOf = (i, st) => {
    if (!done) return 0
    if (st === 'gem') return instant ? revealed.indexOf(i) * step : 0
    if (st === 'hit') return instant ? revealed.length * step : 0
    return (instant ? revealed.length * step + 60 : 170) + ringDistance(i, origin) * (instant ? 18 : 34)
  }

  // Readouts ------------------------------------------------------------------
  const gems = playing ? round.gems : 0
  const multNow = playing ? round.multiplier : done ? round.result.multiplier : 1
  const nextMult = playing ? round.nextMultiplier : multiplier(mines, 1)
  const multShown = useCountUp(multNow)
  const gemsLeft = maxGems(boardMines) - gems
  const chance = playing ? nextSafeChance(round.mines, round.gems) : nextSafeChance(mines, 0)
  const chanceTone = chance >= 0.75 ? 'bg-yes' : chance >= 0.45 ? 'bg-warn' : 'bg-no'
  const picksPay = picked.length ? multiplier(mines, picked.length) : null
  const autoCashN = Number(autoCash)
  const autoCashValid = autoCashN >= 1 && autoCashN <= maxGems(boardMines)
  const [hitRow, hitCol] = hit !== null ? rowCol(hit) : [2, 2]

  const multSub = playing
    ? round.gems
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
        <div className="grid gap-2">
          <button
            type="button"
            className="btn w-full bg-yes py-3 text-base font-bold text-black shadow-[0_0_24px_rgb(47_191_113/0.45)] hover:bg-yes-strong disabled:opacity-50 disabled:shadow-none"
            onClick={cashout}
            disabled={locked || round.gems < 1}
            aria-keyshortcuts="C"
          >
            {round.gems ? (
              <>
                Cash out <span className="tabular">{formatCurrency(round.payout)}</span>
                <Kbd>C</Kbd>
              </>
            ) : (
              'Open a tile to cash out'
            )}
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={randomTile} disabled={locked} aria-keyshortcuts="Space">
            Random tile
            <Kbd>Space</Kbd>
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary w-full py-3 text-base font-bold shadow-[0_0_26px_rgb(141_25_26/0.55)] disabled:shadow-none"
          onClick={start}
          disabled={locked || !canBet}
          aria-keyshortcuts="Space"
        >
          {done ? 'Bet again' : 'Bet'}
          <Kbd>Space</Kbd>
        </button>
      )
    ) : runner.running ? (
      <button type="button" className="btn btn-ghost w-full py-3" onClick={runner.stop} aria-keyshortcuts="Space">
        Stop autobet
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
        Start autobet
        <Kbd>Space</Kbd>
      </button>
    )

  return (
    <GameShell game="mines" title="Mines" subtitle="Find gems, dodge mines, and cash out before your luck runs out." rules={<Rules />}>
      <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <section className="card order-2 space-y-4 p-4 md:order-1" aria-label="Mines controls">
          <ModeTabs value={mode} onChange={changeMode} disabled={locked || playing} />
          <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked || playing} />
          <div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs font-medium text-muted">Mines</span>
                <select className="input mt-1.5 tabular" value={boardMines} disabled={locked || playing} onChange={(e) => changeMines(Number(e.target.value))}>
                  {MINE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="text-xs font-medium text-muted">Gems</span>
                <p className="input mt-1.5 tabular text-muted">{TILES - boardMines}</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1" role="group" aria-label="Quick mine counts">
              {MINE_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={locked || playing}
                  aria-pressed={boardMines === n}
                  onClick={() => changeMines(n)}
                  className={`rounded-lg py-1 text-xs font-semibold tabular transition disabled:opacity-50 ${
                    boardMines === n ? 'bg-primary-500/25 text-primary-200 ring-1 ring-primary-400' : 'bg-surface-2 text-muted hover:bg-surface-3 hover:text-fg'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {mode === 'manual' ? (
            <>
              <div className="hidden md:block">{actions}</div>
              <label className="block">
                <span className="text-xs font-medium text-muted">Auto cash out after (gems)</span>
                <input
                  type="number"
                  min="1"
                  max={maxGems(boardMines)}
                  placeholder="Off"
                  className="input mt-1.5 tabular"
                  value={autoCash}
                  onChange={(e) => setAutoCash(e.target.value)}
                />
                <span className="mt-1 block text-[11px] text-subtle tabular">
                  {autoCashValid ? `Cashes out at ${formatMult(multiplier(boardMines, autoCashN))} after ${autoCashN} gem${autoCashN === 1 ? '' : 's'}.` : 'Leave empty to cash out yourself.'}
                </span>
              </label>
            </>
          ) : (
            <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running}>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                <span>
                  {picked.length
                    ? `${picked.length} tile${picked.length === 1 ? '' : 's'} picked, pays ${formatMult(picksPay)} when all are gems.`
                    : 'Tap tiles on the board to pick the ones opened every round.'}
                </span>
                {picked.length > 0 && !runner.running && (
                  <button type="button" className="shrink-0 font-semibold text-primary-300 hover:underline" onClick={() => setPicked([])}>
                    Clear
                  </button>
                )}
              </div>
              <div className="hidden md:block">{actions}</div>
            </AutoSettings>
          )}
        </section>

        <section className="card order-1 overflow-hidden p-3 sm:p-5 md:order-2" aria-label="Mines board">
          <div className="flex items-center gap-2">
            <RoundHistory items={recent} />
            <div className="flex shrink-0 gap-2">
              <FairnessButton game="mines" />
              <SoundToggle />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat
              label={mode === 'auto' && !done ? 'Picks pay' : 'Multiplier'}
              tone={done ? (round.result.win ? 'text-yes mc-glow-yes' : 'text-no') : playing && gems ? 'text-yes' : 'text-fg'}
              sub={mode === 'auto' && !done ? `${picked.length} pick${picked.length === 1 ? '' : 's'}` : multSub}
              bump={playing ? gems : undefined}
            >
              {formatMult(mode === 'auto' && !done ? (picksPay ?? 1) : multShown)}
            </Stat>
            <Stat label="Next gem" tone="text-yes" sub={`${gemsLeft} gem${gemsLeft === 1 ? '' : 's'} left`}>
              {nextMult ? formatMult(nextMult) : 'None'}
            </Stat>
            <Stat label="Safe pick" sub={<span className="mn-meter mt-1.5 block" aria-hidden="true"><span className={chanceTone} style={{ width: `${chance * 100}%` }} /></span>}>
              {(chance * 100).toFixed(1)}%
            </Stat>
          </div>

          <div className="relative mx-auto mt-4 max-w-[30rem]">
            <div
              key={`board-${round.nonce ?? 'idle'}`}
              className={`relative grid grid-cols-5 gap-2 rounded-2xl sm:gap-2.5 ${done && hit !== null && !instant ? 'mn-shake' : ''} ${done && round.result.win ? 'mn-board-win' : ''} ${instant ? 'mn-fast' : ''}`}
            >
              {Array.from({ length: TILES }, (_, i) => {
                const st = tileState(i)
                const isPicked = mode === 'auto' ? picked.includes(i) : undefined
                return (
                  <MinesTile
                    key={i}
                    index={i}
                    state={st}
                    delay={delayOf(i, st)}
                    picked={isPicked}
                    pending={pending === i}
                    interactive={mode === 'manual' ? playing && st === 'hidden' && !locked : !runner.running}
                    disabled={mode === 'manual' ? !playing || st !== 'hidden' || locked : runner.running}
                    onClick={() => (mode === 'manual' ? reveal(i) : togglePick(i))}
                  />
                )
              })}
              {done && hit !== null && (
                <span className="mn-hitflash" style={{ '--hx': `${hitCol * 20 + 10}%`, '--hy': `${hitRow * 20 + 10}%` }} aria-hidden="true" />
              )}
            </div>
            {result && (
              <div key={`result-${result.key}`} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {result.confetti && <Confetti />}
                <ResultCard result={result} />
              </div>
            )}
          </div>

          <div className="mt-4 md:hidden">{actions}</div>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {live}
          </p>
        </section>
      </div>
    </GameShell>
  )
}
