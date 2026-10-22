/**
 * Presentation pieces shared by Mines and Chicken Cross: the recent-rounds
 * strip, stat tiles, the result card, confetti and key hints. Styles live in
 * src/pages/games/mines.css (prefixed mc-), which both pages import.
 */
import { formatCurrency } from '../../../utils/format.js'
import { formatMult, useCountUp } from './hooks.js'

/** Newest first; each item is { id, win, mult }. */
export function RoundHistory({ items, label = 'Recent rounds' }) {
  return (
    <div className="mc-history relative min-w-0 flex-1">
      {items.length ? (
        <ol className="flex gap-1.5" aria-label={label}>
          {items.map((h, i) => (
            <li
              key={h.id}
              className={`mc-history-chip relative shrink-0 rounded-md px-2 py-1 text-[11px] font-bold tabular ${i === 0 ? 'mc-history-new' : ''} ${
                h.win ? 'bg-yes/15 text-yes ring-1 ring-yes/30' : 'bg-no/12 text-no ring-1 ring-no/25'
              }`}
            >
              <span className="sr-only">{h.win ? 'Won at ' : 'Lost, '}</span>
              {formatMult(h.mult)}
            </li>
          ))}
        </ol>
      ) : (
        <p className="truncate text-xs text-subtle">No rounds yet</p>
      )}
    </div>
  )
}

export function Stat({ label, children, sub, tone = '', bump, className = '' }) {
  return (
    <div className={`min-w-0 rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-line ${className}`}>
      <p className="truncate text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <p key={bump} className={`mt-0.5 truncate text-lg leading-tight font-bold tabular sm:text-xl ${bump !== undefined ? 'mc-bump' : ''} ${tone}`}>
        {children}
      </p>
      {sub !== undefined && <p className="truncate text-[11px] text-subtle tabular">{sub}</p>}
    </div>
  )
}

function CountMoney({ value }) {
  return <>{formatCurrency(useCountUp(value, 650))}</>
}

/**
 * The end-of-round card. Wins stay up with the payout counting up; losses
 * show briefly and fade so the revealed board can be read.
 */
export function ResultCard({ result, className = '' }) {
  if (!result) return null
  const { win, payout, mult, title, sub, note } = result
  return (
    <div className={`pointer-events-none flex justify-center ${className}`}>
      <div
        className={`mc-result relative overflow-hidden rounded-2xl border px-6 py-3.5 text-center shadow-2xl backdrop-blur-sm sm:px-8 ${
          win ? 'mc-result-win border-yes/70 bg-[#07170f]/90' : 'mc-result-loss border-no/70 bg-[#1a0b06]/90'
        }`}
      >
        {win && <span className="mc-result-shine" aria-hidden="true" />}
        <p className={`text-[11px] font-semibold tracking-[0.2em] uppercase ${win ? 'text-yes/80' : 'text-no/80'}`}>{title}</p>
        <p className={`mt-0.5 text-3xl font-extrabold tabular sm:text-4xl ${win ? 'text-yes' : 'text-no'}`}>
          {win ? (
            <>
              +<CountMoney value={payout} />
            </>
          ) : (
            sub
          )}
        </p>
        {win && <p className="mx-auto mt-1.5 w-fit rounded-full bg-yes/15 px-2.5 py-0.5 text-xs font-bold text-yes tabular">{formatMult(mult)}</p>}
        {note && <p className="mt-1.5 text-[11px] text-white/60">{note}</p>}
      </div>
    </div>
  )
}

const CONFETTI_COLORS = ['#f5b82e', '#2fbf71', '#7ee8a8', '#f08a92', '#ededf0', '#e8b13a']

/** A short confetti burst from the middle of the parent (which must be positioned). Hidden with reduced motion. */
export function Confetti({ pieces = 34 }) {
  return (
    <div className="mc-confetti pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => {
        const a = (i / pieces) * Math.PI * 2 + (i % 3) * 0.35
        const r = 120 + ((i * 53) % 110)
        return (
          <span
            key={i}
            className="mc-confetti-piece"
            style={{
              '--cx': `${Math.cos(a) * r}px`,
              '--cy': `${Math.sin(a) * r * 0.8 - 40}px`,
              '--cr': `${(i * 97) % 720 - 360}deg`,
              '--cd': `${(i % 5) * 30}ms`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              width: i % 2 ? 6 : 8,
              height: i % 2 ? 10 : 5,
            }}
          />
        )
      })}
    </div>
  )
}

/** A keyboard hint inside a button; hidden on touch screens and from screen readers. */
export function Kbd({ children }) {
  return (
    <kbd className="mc-kbd ml-1 rounded border border-current/30 px-1.5 py-px font-sans text-[10px] leading-4 font-semibold opacity-70" aria-hidden="true">
      {children}
    </kbd>
  )
}
