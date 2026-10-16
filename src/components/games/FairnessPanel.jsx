import { useEffect, useId, useState } from 'react'
import * as chicken from '../../games/chicken.js'
import { formatRoll, rollFromFloat } from '../../games/dice.js'
import { fairFloats, SEED_BETS } from '../../games/fair.js'
import { placeMines } from '../../games/mines.js'
import { FLOAT_COUNT, playRound } from '../../games/boneyard.js'
import { formatMult, resultFromFloat } from '../../games/limbo.js'
import { useFairStore } from '../../services/games/fairSeeds.js'
import Modal from '../ui/Modal.jsx'

function Row({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs break-all text-fg">{children}</div>
    </div>
  )
}

function MiniGrid({ mines }) {
  return (
    <div className="grid w-40 grid-cols-5 gap-1" aria-label={`Mines on tiles ${mines.join(', ')}`}>
      {Array.from({ length: 25 }, (_, i) => (
        <span key={i} className={`aspect-square rounded ${mines.includes(i) ? 'bg-no' : 'bg-yes/70'}`} title={`Tile ${i}`} />
      ))}
    </div>
  )
}

/**
 * Recomputes a bet from the revealed seeds, entirely in the browser. The seeds
 * are fixed; players only pick which bet to look at.
 */
function Verifier({ game, previous }) {
  const ids = useId()
  const [nonce, setNonce] = useState(0)
  const [mines, setMines] = useState(3)
  const [difficulty, setDifficulty] = useState('medium')
  const [out, setOut] = useState(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const floats = await fairFloats({ serverSeed: previous.serverSeed, clientSeed: previous.clientSeed, nonce }, game === 'boneyard' ? FLOAT_COUNT : 30)
      if (!live) return
      setOut({
        roll: formatRoll(rollFromFloat(floats[0])),
        mines: placeMines(floats, mines),
        crash: chicken.crashLane(floats, difficulty),
        limbo: resultFromFloat(floats[0]),
        slot: game === 'boneyard' ? playRound(floats) : null,
      })
    })()
    return () => {
      live = false
    }
  }, [game, previous, nonce, mines, difficulty])

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block" htmlFor={`${ids}-n`}>
          <span className="text-xs font-medium text-muted">Bet</span>
          <select id={`${ids}-n`} className="input mt-1 tabular" value={nonce} onChange={(e) => setNonce(Number(e.target.value))}>
            {Array.from({ length: previous.nonce }, (_, n) => (
              <option key={n} value={n}>
                Bet {n + 1} (nonce {n})
              </option>
            ))}
          </select>
        </label>
        {game === 'mines' && (
          <label className="block" htmlFor={`${ids}-m`}>
            <span className="text-xs font-medium text-muted">Mines in that round</span>
            <select id={`${ids}-m`} className="input mt-1 tabular" value={mines} onChange={(e) => setMines(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, k) => (
                <option key={k} value={k + 1}>
                  {k + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        {game === 'chicken' && (
          <label className="block" htmlFor={`${ids}-d`}>
            <span className="text-xs font-medium text-muted">Difficulty in that round</span>
            <select id={`${ids}-d`} className="input mt-1" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              {chicken.DIFFICULTY_IDS.map((d) => (
                <option key={d} value={d}>
                  {chicken.DIFFICULTIES[d].label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {out && (
        <div className="space-y-2 rounded-xl border border-line p-3 text-sm" aria-live="polite">
          {game === 'dice' && (
            <p>
              Roll: <span className="font-mono text-lg font-bold">{out.roll}</span>
            </p>
          )}
          {game === 'mines' && (
            <div className="flex items-center gap-3">
              <MiniGrid mines={out.mines} />
              <p className="text-xs text-muted">Mines on tiles {out.mines.join(', ')} (counting from 0, left to right, top to bottom).</p>
            </div>
          )}
          {game === 'chicken' && <p>{out.crash ? `Hit on lane ${out.crash}` : 'Clears every lane'}</p>}
          {(game === 'limbo' || game === 'crash') && (
            <p>
              {game === 'crash' ? 'Crash point' : 'Result'}: <span className="font-mono text-lg font-bold">{formatMult(out.limbo)}</span>
            </p>
          )}
          {game === 'boneyard' && out.slot && (
            <p>
              Paid <span className="font-mono text-lg font-bold">{(out.slot.units / 100).toFixed(2)}×</span> the bet
              {out.slot.bonus ? ` with ${out.slot.bonus === 'last-rites' ? 'Last Rites' : 'High Noon'} free spins` : ''}
              {out.slot.spins[0].rip ? ' (R.I.P.)' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Provably fair seeds, read only: the active server seed's hash (committed
 * before betting), the client seed, the nonce, the last retired pair with its
 * server seed revealed, and a verifier for the bets made with it.
 */
function FairnessDetails({ game }) {
  const info = useFairStore((s) => s.info)
  const load = useFairStore((s) => s.load)

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="space-y-4 text-sm text-muted">
      <p className="leading-relaxed">
        Every result comes from HMAC-SHA256(server seed, &quot;client seed:nonce:round&quot;). The seeds are set for you and can&apos;t be changed. You see a
        hash of the server seed before you bet, and the nonce counts your bets. After {SEED_BETS} bets the pair is retired, its server seed is revealed
        below, and new seeds take over, so you can check every one of those bets.
      </p>
      {info ? (
        <>
          <Row label="Active server seed (SHA-256 hash)">{info.serverSeedHash}</Row>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Row label="Client seed">{info.clientSeed}</Row>
            <Row label="Nonce">{info.nonce}</Row>
          </div>
          {info.previous ? (
            <>
              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-xs font-semibold text-fg">
                  Previous seeds ({info.previous.nonce} bet{info.previous.nonce === 1 ? '' : 's'})
                </p>
                <Row label="Server seed (revealed)">{info.previous.serverSeed}</Row>
                <Row label="Its SHA-256 hash">{info.previous.serverSeedHash}</Row>
                <Row label="Client seed">{info.previous.clientSeed}</Row>
              </div>
              {info.previous.nonce > 0 && (
                <div className="border-t border-line pt-3">
                  <p className="mb-2 text-xs font-semibold text-fg">Verify a bet</p>
                  <Verifier key={info.previous.serverSeed} game={game} previous={info.previous} />
                </div>
              )}
            </>
          ) : (
            <p className="border-t border-line pt-3 text-xs">
              Your first server seed is revealed after {SEED_BETS} bets ({Math.max(0, SEED_BETS - info.nonce)} to go).
            </p>
          )}
        </>
      ) : (
        <p>Loading seeds…</p>
      )}
    </div>
  )
}

/** Small button in the game header that opens the provably fair seeds and verifier. */
export default function FairnessButton({ game }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost shrink-0 px-3 text-xs whitespace-nowrap" aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        Fairness
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Provably fair" size="lg">
        <FairnessDetails game={game} />
      </Modal>
    </>
  )
}
