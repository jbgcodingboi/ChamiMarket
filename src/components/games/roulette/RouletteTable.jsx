import { useEffect, useState } from 'react'
import { colorOf, column, corner, dozen, numberAt, outside, sixline, split, straight, street } from '../../../games/roulette.js'
import { Chip } from '../Chip.jsx'

const CELL_BG = { red: 'bg-[#b3202a]', black: 'bg-[#18181b]', green: 'bg-[#138a43]' }
const NARROW = '(max-width: 639px)'

/*
 * Grid placement and hotspot positions for both layouts. Wide screens get the
 * classic horizontal table; phones get it turned upright (zero on top, the
 * 1-2-3 columns running down), so nothing needs a sideways scroll.
 */
const LAYOUT = {
  wide: {
    grid: { gridTemplateColumns: '1.2fr repeat(12, minmax(0, 1fr)) 1.2fr', gridTemplateRows: 'repeat(3, 3rem) 2.6rem 2.6rem' },
    zero: { gridColumn: 1, gridRow: '1 / 4' },
    number: (c, r) => ({ gridColumn: c + 2, gridRow: r + 1 }),
    column: (r) => ({ gridColumn: 14, gridRow: r + 1 }),
    dozen: (d) => ({ gridColumn: `${2 + d * 4} / span 4`, gridRow: 4 }),
    outside: (i) => ({ gridColumn: `${2 + i * 2} / span 2`, gridRow: 5 }),
    edge: {
      zeroSplit: 'top-[15%] -left-2 h-[70%] w-4',
      nextSplit: 'top-[15%] -right-2 h-[70%] w-4',
      upSplit: '-top-2 left-[15%] h-4 w-[70%]',
      corner: '-top-2.5 -right-2.5 z-20 size-5',
      street: '-bottom-2 left-[15%] h-4 w-[70%]',
      sixline: '-right-2.5 -bottom-2.5 z-20 size-5',
    },
    outsideChip: 'justify-end pr-1.5',
  },
  narrow: {
    grid: { gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 0.9fr) repeat(3, minmax(0, 1.3fr))', gridTemplateRows: '2.75rem repeat(12, 2.5rem) 2.5rem' },
    zero: { gridColumn: '3 / 6', gridRow: 1 },
    number: (c, r) => ({ gridColumn: 3 + (2 - r), gridRow: c + 2 }),
    column: (r) => ({ gridColumn: 3 + (2 - r), gridRow: 14 }),
    dozen: (d) => ({ gridColumn: 2, gridRow: `${2 + d * 4} / span 4` }),
    outside: (i) => ({ gridColumn: 1, gridRow: `${2 + i * 2} / span 2` }),
    edge: {
      zeroSplit: '-top-2 left-[15%] h-4 w-[70%]',
      nextSplit: '-bottom-2 left-[15%] h-4 w-[70%]',
      upSplit: 'top-[15%] -right-2 h-[70%] w-4',
      corner: '-right-2.5 -bottom-2.5 z-20 size-5',
      street: 'top-[15%] -left-2 h-[70%] w-4',
      sixline: '-bottom-2.5 -left-2.5 z-20 size-5',
    },
    outsideChip: 'items-end pb-1',
  },
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW)
    if (!mq) return undefined
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

const COLS = Array.from({ length: 12 }, (_, i) => i)
const ROWS = [0, 1, 2]

const chipState = (settled, won) => (settled ? (won ? 'rt-chip-win' : 'rt-chip-lose') : '')
const placedLabel = (bet, amount, settled, won) =>
  `${bet.label}${amount ? `, ${amount} dollars ${settled ? (won ? 'won' : 'lost') : 'placed'}` : ''}`

/** Invisible hit area on a cell edge or corner for split, street, corner and six-line bets. */
function Hotspot({ bet, amount, onPlace, onHover, disabled, settled, won, className }) {
  return (
    <button
      type="button"
      aria-label={placedLabel(bet, amount, settled, won)}
      disabled={disabled}
      onClick={() => onPlace(bet)}
      onMouseEnter={() => onHover(bet.numbers)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(bet.numbers)}
      onBlur={() => onHover(null)}
      className={`absolute z-10 flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-warn disabled:cursor-default ${className}`}
    >
      {amount > 0 && (
        <span key={amount} className={`pointer-events-none rt-chip-drop ${chipState(settled, won)}`}>
          <Chip amount={amount} size={22} />
        </span>
      )}
    </button>
  )
}

/** A full cell bet (a number, column, dozen or even-money bet). */
function Main({ bet, amount, onPlace, onHover, disabled, lit, winning, hit, settled, won, chipAt = '', className = '', color = '', children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPlace(bet)}
      onMouseEnter={() => onHover(bet.numbers)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(bet.numbers)}
      onBlur={() => onHover(null)}
      aria-label={placedLabel(bet, amount, settled, won)}
      className={`relative flex h-full w-full items-center justify-center font-bold text-white outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-warn focus-visible:ring-inset disabled:cursor-default ${color} ${
        lit ? 'rt-lit' : ''
      } ${winning ? 'rt-win-cell z-[5]' : hit ? 'rt-win-outside' : ''} ${className}`}
    >
      <span className="relative tabular drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]">{children}</span>
      {winning && <span className="rt-dolly" aria-hidden="true" />}
      {amount > 0 && (
        <span className={`pointer-events-none absolute inset-0 flex items-center justify-center ${chipAt}`}>
          <span key={amount} className={`rt-chip-drop ${chipState(settled, won)}`}>
            <Chip amount={amount} size={26} />
          </span>
        </span>
      )}
    </button>
  )
}

const OUTSIDE_COLOR = 'bg-transparent enabled:hover:bg-white/10'

/**
 * European betting layout: zero, the 1-36 grid (three rows, twelve
 * columns), column bets, dozens and even-money bets. Cell edges and corners
 * take split, street, corner and six-line bets.
 */
export default function RouletteTable({ bets, onPlace, disabled, winning, settled = false }) {
  const [hover, setHover] = useState(null)
  const L = LAYOUT[useNarrow() ? 'narrow' : 'wide']
  const amountOf = (bet) => bets[bet.key]?.amount ?? 0
  const lit = (n) => !disabled && Boolean(hover?.includes(n))
  const won = (bet) => winning !== null && winning !== undefined && bet.numbers.includes(winning)
  const common = { onPlace, onHover: setHover, disabled, settled }
  const cell = (bet, props) => <Main bet={bet} amount={amountOf(bet)} won={won(bet)} {...common} {...props} />
  const edge = (bet, className) => <Hotspot bet={bet} amount={amountOf(bet)} won={won(bet)} {...common} className={className} />
  const outsideCell = (bet, label, color = OUTSIDE_COLOR) =>
    cell(bet, { color, className: 'text-xs sm:text-sm', chipAt: L.outsideChip, hit: won(bet), lit: !disabled && Boolean(hover) && bet.numbers.every((n) => hover.includes(n)), children: label })

  return (
    <div className={`rt-rail rounded-2xl p-1.5 ${disabled ? 'rt-locked' : ''}`}>
      <div className="felt grid gap-0 rounded-xl p-2.5 text-sm select-none sm:p-3" style={L.grid}>
        <div className="border border-white/30" style={L.zero}>
          {cell(straight(0), { color: `${CELL_BG.green} enabled:hover:brightness-125`, className: 'text-lg', lit: lit(0), winning: winning === 0, children: '0' })}
        </div>

        {COLS.map((c) =>
          ROWS.map((r) => {
            const n = numberAt(c, r)
            return (
              <div key={n} className="relative border border-white/30" style={L.number(c, r)}>
                {cell(straight(n), { color: `${CELL_BG[colorOf(n)]} enabled:hover:brightness-125`, className: 'text-base', lit: lit(n), winning: winning === n, children: n })}
                {c === 0 && edge(split(0, n), L.edge.zeroSplit)}
                {c < 11 && edge(split(n, n + 3), L.edge.nextSplit)}
                {r > 0 && edge(split(n, n + 1), L.edge.upSplit)}
                {r > 0 && c < 11 && edge(corner(n), L.edge.corner)}
                {r === 2 && edge(street(c), L.edge.street)}
                {r === 2 && c < 11 && edge(sixline(c), L.edge.sixline)}
              </div>
            )
          }),
        )}

        {ROWS.map((r) => (
          <div key={`col${r}`} className="border border-white/30" style={L.column(r)}>
            {outsideCell(column(2 - r), '2 to 1')}
          </div>
        ))}

        {[0, 1, 2].map((d) => (
          <div key={`dz${d}`} className="border border-white/30" style={L.dozen(d)}>
            {outsideCell(dozen(d), dozen(d).label)}
          </div>
        ))}

        {[
          [outside.low, '1 to 18'],
          [outside.even, 'Even'],
          [outside.red, <span key="r" className="block size-5 rotate-45 rounded-sm bg-[#b3202a] ring-1 ring-white/60" />, OUTSIDE_COLOR],
          [outside.black, <span key="b" className="block size-5 rotate-45 rounded-sm bg-[#18181b] ring-1 ring-white/60" />, OUTSIDE_COLOR],
          [outside.odd, 'Odd'],
          [outside.high, '19 to 36'],
        ].map(([bet, label, color], i) => (
          <div key={bet.key} className="border border-white/30" style={L.outside(i)}>
            {outsideCell(bet, label, color)}
          </div>
        ))}
      </div>
    </div>
  )
}
