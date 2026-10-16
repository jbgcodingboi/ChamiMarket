import { useEffect, useRef, useState } from 'react'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { maxGems, multiplier, nextSafeChance, TILES } from '../../games/mines.js'
import { sounds } from '../../games/sound.js'
import { minesApi } from '../../services/games/rounds.js'
import { useAccountStore } from '../../store/accountStore.js'
import { useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { formatCurrency } from '../../utils/format.js'

const MINE_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1)

function Gem() {
  return (
    <svg viewBox="0 0 40 40" className="size-3/5 drop-shadow-[0_0_10px_rgb(47_191_113/0.7)]" aria-hidden="true">
      <path d="M10 6h20l8 10-18 20L2 16Z" fill="#2fbf71" />
      <path d="M10 6h20l8 10H2Z" fill="#7ee8a8" />
      <path d="M14 16h12L20 36Z" fill="#1f9b58" />
      <path d="M10 6l4 10M30 6l-4 10M20 6v10" stroke="#c9ffe0" strokeWidth="1.2" opacity="0.7" />
    </svg>
  )
}

function Bomb() {
  return (
    <svg viewBox="0 0 40 40" className="size-3/5" aria-hidden="true">
      <circle cx="18" cy="23" r="13" fill="#18181b" stroke="#f5703c" strokeWidth="2" />
      <circle cx="13" cy="18" r="3.5" fill="#fff" opacity="0.35" />
      <path d="M26 12l5-5" stroke="#a8a29e" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32.5" cy="5.5" r="3" fill="#f5b82e" />
    </svg>
  )
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
  const [picked, setPicked] = useState([])
  const [autoCash, setAutoCash] = useState('')
  const [flash, setFlash] = useState(null)
  const runner = useAutoBet()
  const busyRef = useRef(false)

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
  const shownMines = playing || done ? round.mines : mines
  const locked = busy || runner.running

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

  const announce = (r) => {
    if (r?.phase !== 'done') return
    if (r.result.win) {
      sounds.win()
      setFlash({ win: true, text: `+${formatCurrency(r.result.payout)}`, sub: `${r.result.multiplier}×`, key: r.nonce })
    } else {
      sounds.boom()
      setFlash({ win: false, text: 'Boom', sub: 'Mine hit', key: r.nonce })
    }
  }

  const start = async () => {
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    setFlash(null)
    const r = await act(() => minesApi.start({ amount: bet, mines }))
    if (r) sounds.click()
  }

  const reveal = async (tile) => {
    if (!playing || locked || round.revealed.includes(tile)) return
    const r = await act(() => minesApi.reveal(tile))
    if (!r) return
    if (r.phase === 'playing') {
      sounds.gem()
      const target = Number(autoCash)
      if (target >= 1 && r.gems >= target) announce(await act(() => minesApi.cashout()))
    } else announce(r)
  }

  const cashout = async () => announce(await act(() => minesApi.cashout()))

  const randomTile = () => {
    const free = Array.from({ length: TILES }, (_, i) => i).filter((i) => !round.revealed.includes(i))
    const pick = new Uint32Array(1)
    globalThis.crypto.getRandomValues(pick)
    reveal(free[pick[0] % free.length])
  }

  /** Clears a finished round off the board so auto picks can be seen and edited. */
  const clearBoard = () => {
    if (round.phase === 'done') {
      setRound({ phase: 'idle' })
      setFlash(null)
    }
  }

  const changeMode = (m) => {
    setMode(m)
    if (m === 'auto') clearBoard()
  }

  const togglePick = (tile) => {
    if (runner.running) return
    clearBoard()
    setPicked((p) => (p.includes(tile) ? p.filter((t) => t !== tile) : p.length < maxGems(mines) ? [...p, tile] : p))
  }

  const startAuto = () => {
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    if (!picked.length) return toast({ tone: 'info', title: 'Pick tiles first', description: 'Click the tiles you want to open every round.' })
    setFlash(null)
    runner.start({
      settings: auto,
      baseBet: bet,
      balance: () => useAccountStore.getState().portfolio?.cash ?? 0,
      gapMs: 650,
      play: async (amount) => {
        const r = await minesApi.auto({ amount, mines, tiles: picked })
        setRound(r)
        announce(r)
        return { net: roundMoney(r.result.payout - amount) }
      },
    })
  }

  const tileState = (i) => {
    const revealed = round.revealed?.includes(i)
    const isMine = round.result?.positions?.includes(i)
    if (done) {
      if (round.result.hit === i) return 'hit'
      if (revealed) return 'gem'
      return isMine ? 'mine-dim' : 'gem-dim'
    }
    if (revealed) return 'gem'
    return 'hidden'
  }

  const nextChance = playing ? nextSafeChance(round.mines, round.gems) : nextSafeChance(mines, 0)

  return (
    <GameShell game="mines" title="Mines" subtitle="Find gems, dodge mines, and cash out before your luck runs out." rules={<Rules />}>
      <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <section className="card order-2 space-y-4 p-4 md:order-1" aria-label="Mines controls">
          <ModeTabs value={mode} onChange={changeMode} disabled={runner.running || playing} />
          <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked || playing} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-muted">Mines</span>
              <select className="input mt-1.5 tabular" value={shownMines} disabled={locked || playing} onChange={(e) => {
                  setMines(Number(e.target.value))
                  setPicked([])
                }}>
                {MINE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="text-xs font-medium text-muted">Gems</span>
              <p className="input mt-1.5 tabular">{TILES - shownMines}</p>
            </div>
          </div>

          {mode === 'manual' ? (
            <>
              {playing ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="btn w-full bg-yes py-3 text-base font-bold text-black shadow-[0_0_24px_rgb(47_191_113/0.45)] hover:bg-yes-strong disabled:opacity-50"
                    onClick={cashout}
                    disabled={locked || round.gems < 1}
                  >
                    {round.gems ? `Cash out ${formatCurrency(round.payout)}` : 'Open a tile'}
                  </button>
                  <button type="button" className="btn btn-ghost w-full" onClick={randomTile} disabled={locked}>
                    Pick a random tile
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={start} disabled={locked || !(bet >= 0.1) || bet > balance}>
                  Bet
                </button>
              )}
              <label className="block">
                <span className="text-xs font-medium text-muted">Auto cash out after (gems)</span>
                <input type="number" min="1" max={maxGems(shownMines)} placeholder="Off" className="input mt-1.5 tabular" value={autoCash} onChange={(e) => setAutoCash(e.target.value)} />
              </label>
            </>
          ) : (
            <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running}>
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                {picked.length
                  ? `${picked.length} tile${picked.length === 1 ? '' : 's'} picked: pays ${multiplier(mines, picked.length)}× when all are gems.`
                  : 'Click tiles on the board to pick the ones opened every round.'}
              </p>
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

        <section className="card order-1 p-4 sm:p-6 md:order-2" aria-label="Mines board">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-surface-2 px-3 py-1 tabular">
                Multiplier <strong className="text-fg">{playing ? round.multiplier : 1}×</strong>
              </span>
              <span className="rounded-full bg-surface-2 px-3 py-1 tabular">
                Next gem <strong className="text-yes">{multiplier(shownMines, (playing ? round.gems : 0) + 1)}×</strong>
              </span>
              <span className="rounded-full bg-surface-2 px-3 py-1 tabular text-muted">Safe chance {(nextChance * 100).toFixed(1)}%</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <FairnessButton game="mines" />
              <SoundToggle />
            </div>
          </div>
          <div className="relative mx-auto max-w-[30rem]">
            <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
              {Array.from({ length: TILES }, (_, i) => {
                const st = tileState(i)
                const selected = mode === 'auto' && picked.includes(i) && !done
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Tile ${i + 1}${st === 'gem' ? ', gem' : st === 'hit' ? ', mine' : ''}`}
                    aria-pressed={mode === 'auto' ? selected : undefined}
                    disabled={mode === 'manual' ? !playing || st !== 'hidden' || locked : runner.running}
                    onClick={() => (mode === 'manual' ? reveal(i) : togglePick(i))}
                    className={`mines-tile flex aspect-square items-center justify-center rounded-xl transition duration-200 ${
                      st === 'hidden'
                        ? `bg-surface-3 shadow-[inset_0_-4px_0_rgb(0_0_0/0.35)] ${playing || mode === 'auto' ? 'hover:-translate-y-0.5 hover:bg-line-strong' : ''} ${selected ? 'ring-2 ring-primary-300 bg-primary-500/30' : ''}`
                        : st === 'gem'
                          ? 'bg-[#123524] ring-1 ring-yes/50 animate-chip-pop'
                          : st === 'hit'
                            ? 'bg-no/30 ring-2 ring-no mines-boom'
                            : 'bg-surface-2 opacity-45'
                    }`}
                  >
                    {(st === 'gem' || st === 'gem-dim') && <Gem />}
                    {(st === 'hit' || st === 'mine-dim') && <Bomb />}
                  </button>
                )
              })}
            </div>
            {flash && (
              <div key={flash.key} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className={`rounded-2xl border-2 px-6 py-3 text-center shadow-2xl animate-scale-in ${flash.win ? 'border-yes bg-black/80' : 'border-no bg-black/80'}`}>
                  <p className={`text-2xl font-bold tabular ${flash.win ? 'text-yes' : 'text-no'}`}>{flash.text}</p>
                  <p className="text-xs text-white/70">{flash.sub}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </GameShell>
  )
}
