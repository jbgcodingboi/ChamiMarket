import { useEffect, useId, useState } from 'react'
import * as chicken from '../../games/chicken.js'
import { formatRoll, rollFromFloat } from '../../games/dice.js'
import { fairFloats, newClientSeed, sha256Hex } from '../../games/fair.js'
import { placeMines } from '../../games/mines.js'
import { useFairStore } from '../../services/games/fairSeeds.js'
import { toast } from '../../store/toastStore.js'

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

/** Recomputes any bet from its seeds, entirely in the browser. */
function Verifier({ game, previous }) {
  const ids = useId()
  const [serverSeed, setServerSeed] = useState(previous?.serverSeed ?? '')
  const [clientSeed, setClientSeed] = useState(previous?.clientSeed ?? '')
  const [nonce, setNonce] = useState('0')
  const [mines, setMines] = useState('3')
  const [difficulty, setDifficulty] = useState('medium')
  const [out, setOut] = useState(null)

  useEffect(() => {
    let live = true
    const n = Number(nonce)
    if (!serverSeed || !clientSeed || !Number.isInteger(n) || n < 0) {
      Promise.resolve().then(() => live && setOut(null))
      return () => {
        live = false
      }
    }
    ;(async () => {
      const floats = await fairFloats({ serverSeed, clientSeed, nonce: n }, 30)
      const hash = await sha256Hex(serverSeed)
      if (!live) return
      setOut({
        hash,
        roll: formatRoll(rollFromFloat(floats[0])),
        mines: placeMines(floats, Math.min(24, Math.max(1, Number(mines) || 1))),
        crash: chicken.crashLane(floats, difficulty),
      })
    })()
    return () => {
      live = false
    }
  }, [serverSeed, clientSeed, nonce, mines, difficulty])

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-muted">Server seed (revealed)</span>
          <input id={`${ids}-s`} className="input mt-1 font-mono text-xs" value={serverSeed} onChange={(e) => setServerSeed(e.target.value.trim())} spellCheck="false" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted">Client seed</span>
          <input className="input mt-1 font-mono text-xs" value={clientSeed} onChange={(e) => setClientSeed(e.target.value.trim())} spellCheck="false" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted">Nonce (bet number)</span>
          <input type="number" min="0" className="input mt-1 tabular" value={nonce} onChange={(e) => setNonce(e.target.value)} />
        </label>
        {game === 'mines' && (
          <label className="block">
            <span className="text-xs font-medium text-muted">Mines</span>
            <input type="number" min="1" max="24" className="input mt-1 tabular" value={mines} onChange={(e) => setMines(e.target.value)} />
          </label>
        )}
        {game === 'chicken' && (
          <label className="block">
            <span className="text-xs font-medium text-muted">Difficulty</span>
            <select className="input mt-1" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
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
          <p className="text-xs text-muted">
            SHA-256 of the server seed: <span className="font-mono break-all text-fg">{out.hash}</span>
          </p>
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
        </div>
      )}
    </div>
  )
}

/**
 * Seeds for provably fair play: the active server seed's hash (committed
 * before betting), the editable client seed, the nonce, the last revealed
 * server seed, and a verifier that recomputes any bet.
 */
export default function FairnessPanel({ game, locked }) {
  const info = useFairStore((s) => s.info)
  const load = useFairStore((s) => s.load)
  const rotate = useFairStore((s) => s.rotate)
  const [seed, setSeed] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const change = async () => {
    setBusy(true)
    try {
      await rotate(seed.trim() || newClientSeed())
      setSeed('')
      toast({ tone: 'success', title: 'Seeds changed', description: 'Your previous server seed is revealed below so you can check past bets.' })
    } catch (err) {
      toast({ tone: 'error', title: 'Seeds not changed', description: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="card p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Provably fair</summary>
      <div className="mt-3 space-y-4 text-muted">
        <p className="leading-relaxed">
          Every result comes from HMAC-SHA256(server seed, &quot;client seed:nonce:round&quot;). You see a hash of the server seed before you bet, you pick
          the client seed, and the nonce counts your bets. Change seeds to reveal the old server seed and check any past bet below.
        </p>
        {info ? (
          <>
            <Row label="Active server seed (SHA-256 hash)">{info.serverSeedHash}</Row>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Row label="Client seed">{info.clientSeed}</Row>
              <Row label="Nonce">{info.nonce}</Row>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className="input flex-1 font-mono text-xs"
                placeholder="New client seed (blank for random)"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                aria-label="New client seed"
                spellCheck="false"
              />
              <button type="button" className="btn btn-ghost" disabled={busy || locked} onClick={change} title={locked ? 'Finish the current round first' : undefined}>
                Change seeds
              </button>
            </div>
            {info.previous && (
              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-xs font-semibold text-fg">Previous seeds ({info.previous.nonce} bet{info.previous.nonce === 1 ? '' : 's'})</p>
                <Row label="Server seed (revealed)">{info.previous.serverSeed}</Row>
                <Row label="Its SHA-256 hash">{info.previous.serverSeedHash}</Row>
                <Row label="Client seed">{info.previous.clientSeed}</Row>
              </div>
            )}
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-xs font-semibold text-fg">Verify a bet</p>
              <Verifier key={info.previous?.serverSeed ?? 'none'} game={game} previous={info.previous} />
            </div>
          </>
        ) : (
          <p>Loading seeds…</p>
        )}
      </div>
    </details>
  )
}
