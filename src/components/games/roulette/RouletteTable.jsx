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

/** Invisible hit area on a cell edge or corner for split, street, corner and six-line bets. */
function Hotspot({ bet, amount, onPlace, onHover, disabled, className }) {
  return (
    <button
      type="button"
      aria-label={`${bet.label}${amount ? `, ${amount} dollars placed` : ''}`}
      disabled={disabled}
      onClick={() => onPlace(bet)}
      onMouseEnter={() => onHover(bet.numbers)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(bet.numbers)}
      onBlur={() => onHover(null)}
      className={`absolute z-10 flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-warn disabled:cursor-default ${className}`}
    >
      {amount > 0 && (
        <span className="pointer-events-none animate-chip-pop">
          <Chip amount={amount} size={22} />
        </span>
      )}
    </button>
  )
}

/** A full cell bet (a number, column, dozen or even-money bet). */
function Main({ bet, amount, onPlace, onHover, disabled, lit, winning, className = '', color = '', children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPlace(bet)}
      onMouseEnter={() => onHover(bet.numbers)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(bet.numbers)}
      onBlur={() => onHover(null)}
      aria-label={`${bet.label}${amount ? `, ${amount} dollars placed` : ''}`}
      className={`relative flex h-full w-full items-center justify-center font-bold text-white outline-none transition focus-visible:ring-2 focus-visible:ring-warn focus-visible:ring-inset disabled:cursor-default ${color} ${
        lit ? 'brightness-150' : ''
      } ${winning ? 'z-[5] animate-win-pulse ring-2 ring-warn ring-inset' : ''} ${className}`}
    >
      {children}
      {amount > 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center animate-chip-pop">
          <Chip amount={amount} size={28} />
        </span>
      )}
    </button>
  )
}

const OUTSIDE_COLOR = 'bg-transparent hover:bg-white/10'

/**
 * European betting layout: zero, the 1-36 grid (three rows, twelve
 * columns), column bets, dozens and even-money bets. Cell edges and corners
 * take split, street, corner and six-line bets.
 */
export default function RouletteTable({ bets, onPlace, disabled, winning }) {
  const [hover, setHover] = useState(null)
  const L = LAYOUT[useNarrow() ? 'narrow' : 'wide']
  const amountOf = (bet) => bets[bet.key]?.amount ?? 0
  const lit = (n) => Boolean(hover?.includes(n))
  const common = { onPlace, onHover: setHover, disabled }
  const cell = (bet, props) => <Main bet={bet} amount={amountOf(bet)} {...common} {...props} />
  const edge = (bet, className) => <Hotspot bet={bet} amount={amountOf(bet)} {...common} className={className} />
  const outsideCell = (bet, label, color = OUTSIDE_COLOR) => cell(bet, { color, className: 'text-xs sm:text-sm', children: label })

  return (
    <div className="rounded-2xl">
      <div className="felt grid gap-0 rounded-2xl border-4 border-[#5b3a1e] p-3 text-sm select-none" style={L.grid}>
        <div className="border border-white/30" style={L.zero}>
          {cell(straight(0), { color: `${CELL_BG.green} hover:brightness-125`, className: 'text-lg', lit: lit(0), winning: winning === 0, children: '0' })}
        </div>

        {COLS.map((c) =>
          ROWS.map((r) => {
            const n = numberAt(c, r)
            return (
              <div key={n} className="relative border border-white/30" style={L.number(c, r)}>
                {cell(straight(n), { color: `${CELL_BG[colorOf(n)]} hover:brightness-125`, className: 'text-base', lit: lit(n), winning: winning === n, children: n })}
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
          [outside.red, <span key="r" className="block size-5 rotate-45 rounded-sm bg-[#b3202a] ring-1 ring-white/60" />, 'bg-transparent hover:bg-white/10'],
          [outside.black, <span key="b" className="block size-5 rotate-45 rounded-sm bg-[#18181b] ring-1 ring-white/60" />, 'bg-transparent hover:bg-white/10'],
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
