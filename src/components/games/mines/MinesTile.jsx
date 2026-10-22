/** One Mines tile: a 3D flip card with a gem or a mine on the back. */

export function Gem({ className = '' }) {
  return (
    <svg viewBox="0 0 40 40" className={`mn-gem ${className}`} aria-hidden="true">
      <path d="M10 6h20l8 10-18 20L2 16Z" fill="#2fbf71" />
      <path d="M10 6h20l8 10H2Z" fill="#7ee8a8" />
      <path d="M14 16h12L20 36Z" fill="#1f9b58" />
      <path d="M2 16h12l6 20Z" fill="#27ad65" />
      <path d="M10 6l4 10M30 6l-4 10M20 6v10" stroke="#c9ffe0" strokeWidth="1.2" opacity="0.7" />
      <path d="M13 8.5l-2.5 4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
    </svg>
  )
}

export function Bomb({ className = '' }) {
  return (
    <svg viewBox="0 0 40 40" className={`mn-bomb ${className}`} aria-hidden="true">
      <circle cx="18" cy="23" r="13" fill="#18181b" stroke="#f5703c" strokeWidth="2" />
      <circle cx="13" cy="18" r="3.5" fill="#fff" opacity="0.35" />
      <path d="M26 12l5-5" stroke="#a8a29e" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32.5" cy="5.5" r="3" fill="#f5b82e" />
    </svg>
  )
}

function Sparkles() {
  return (
    <span className="mn-sparkles" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <span key={k} className="mn-spark" style={{ '--sa': `${k * 60 + 15}deg` }} />
      ))}
      <span className="mn-shine" />
    </span>
  )
}

function Blast() {
  return (
    <span className="mn-blast" aria-hidden="true">
      <span className="mn-blast-flash" />
      <span className="mn-blast-ring" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
        <span key={k} className="mn-debris" style={{ '--da': `${k * 45 + 10}deg` }} />
      ))}
    </span>
  )
}

const LABEL = { hidden: 'hidden', gem: 'gem', hit: 'mine, hit', 'gem-dim': 'gem, not opened', 'mine-dim': 'mine' }

/**
 * state: hidden | gem | hit | gem-dim | mine-dim. `delay` (ms) staggers the
 * flip when the board is revealed. `picked` marks an auto-play pick.
 */
export default function MinesTile({ index, state, delay = 0, picked, pending, interactive, disabled, onClick, sparkle = true }) {
  const flipped = state !== 'hidden'
  const isGem = state === 'gem' || state === 'gem-dim'
  const row = Math.floor(index / 5) + 1
  const col = (index % 5) + 1
  return (
    <button
      type="button"
      aria-label={`Tile ${index + 1}, row ${row} column ${col}, ${LABEL[state]}${picked ? ', picked' : ''}`}
      aria-pressed={picked === undefined ? undefined : picked}
      disabled={disabled}
      onClick={onClick}
      className={`mn-tile group relative aspect-square rounded-xl ${interactive ? 'mn-tile-live' : ''} ${pending ? 'mn-tile-pending' : ''} ${picked ? 'mn-tile-picked' : ''}`}
      style={{ '--d': `${delay}ms` }}
    >
      <span className={`mn-inner ${flipped ? 'mn-flipped' : ''}`}>
        <span className="mn-face mn-front">
          <span className="mn-front-dot" aria-hidden="true" />
        </span>
        <span className={`mn-face mn-back ${isGem ? 'mn-back-gem' : 'mn-back-mine'} ${state === 'hit' ? 'mn-back-hit' : ''} ${state.endsWith('dim') ? 'mn-dim' : ''}`}>
          {flipped && (isGem ? <Gem /> : <Bomb />)}
          {state === 'gem' && sparkle && <Sparkles />}
        </span>
      </span>
      {picked && flipped && <span className="mn-picked-ring" aria-hidden="true" />}
      {state === 'hit' && <Blast />}
    </button>
  )
}
