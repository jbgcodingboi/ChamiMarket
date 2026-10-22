import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMult, GROWTH } from '../../../games/limbo.js'
import { formatCurrency } from '../../../utils/format.js'
import { roundMoney } from '../../../utils/math.js'
import { Confetti, WinPop } from './GameFx.jsx'

/** Round steps for an axis: 1, 2 or 5 times a power of ten, giving about `count` ticks over `span`. */
function niceStep(span, count) {
  const raw = span / Math.max(1, count)
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

const tickLabel = (m) => (m >= 100 ? `${Math.round(m).toLocaleString('en-US')}×` : m >= 10 ? `${m.toFixed(0)}×` : `${m.toFixed(m % 1 ? 1 : 0)}×`)

/** The multiplier's color as it climbs: white, then gold, then hot orange. */
function heat(mult) {
  if (mult >= 10) return '#ff8a4c'
  if (mult >= 2) return '#f5b82e'
  return '#ffffff'
}

const PAD = { l: 44, r: 18, t: 18, b: 28 }

/** Sparks for the crash burst, fixed so they render the same every time. */
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + (i % 2 ? 0.2 : 0)
  const d = 28 + (i % 3) * 16
  return { sx: Math.cos(a) * d, sy: Math.sin(a) * d, r: 2 + (i % 3) }
})

/**
 * The rising curve, sized to its box so text stays crisp on any screen. Time
 * runs across and the multiplier up; both axes stretch as the round climbs so
 * the rocket stays in view on long rounds.
 */
export default function CrashChart({ elapsed, mult, phase, result, bet, celebrate, live }) {
  const box = useRef(null)
  const [size, setSize] = useState({ w: 600, h: 300 })
  useEffect(() => {
    const el = box.current
    const measure = () => setSize({ w: Math.max(240, el.clientWidth), h: Math.max(180, el.clientHeight) })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = size
  const crashed = phase === 'done' && !result?.win
  const cashed = phase === 'done' && result?.win
  const flying = phase === 'playing'
  const tMax = Math.max(8000, elapsed * 1.18)
  const mMax = Math.max(2, 1 + (mult - 1) * 1.25)
  const x = (t) => PAD.l + (t / tMax) * (w - PAD.l - PAD.r)
  const y = (m) => h - PAD.b - ((m - 1) / (mMax - 1)) * (h - PAD.t - PAD.b)

  const yTicks = useMemo(() => {
    const step = niceStep(mMax - 1, h < 240 ? 3 : 4)
    const out = []
    for (let m = 1; m <= mMax + 1e-9; m += step) out.push(Math.round(m * 100) / 100)
    return out
  }, [mMax, h])
  const xTicks = useMemo(() => {
    const step = niceStep(tMax / 1000, w < 400 ? 3 : 6)
    const out = []
    for (let s = 0; s <= tMax / 1000 + 1e-9; s += step) out.push(s)
    return out
  }, [tMax, w])

  // Sample the curve densely enough to look smooth at any length.
  const pts = []
  const n = 90
  for (let i = 0; i <= n; i++) {
    const t = (elapsed * i) / n
    pts.push([x(t), y(Math.min(mult, Math.exp(GROWTH * t)))])
  }
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
  const area = `${line}L${x(elapsed).toFixed(1)} ${y(1)}L${x(0)} ${y(1)}Z`
  const [hx, hy] = pts[pts.length - 1]
  const [px, py] = pts[Math.max(0, pts.length - 4)]
  const angle = (Math.atan2(hy - py, hx - px) * 180) / Math.PI

  const stroke = crashed ? '#f5703c' : cashed ? '#2fbf71' : 'url(#crash-stroke)'
  const numColor = crashed ? 'var(--color-no)' : cashed ? 'var(--color-yes)' : flying ? heat(mult) : '#fff'
  const label = formatMult(mult)
  const numSize = `min(${w < 420 ? 3.6 : 5}rem, ${Math.round((w * 1.35) / label.length)}px)`
  const started = elapsed > 0

  return (
    <div
      ref={box}
      className={`crash-stage h-60 rounded-2xl sm:h-80 xl:h-96 ${crashed && live ? 'fx-shake' : ''}`}
      data-phase={phase}
    >
      <div className="crash-stars" aria-hidden="true" />
      <svg width={w} height={h} className="absolute inset-0 block" aria-hidden="true">
        <defs>
          <linearGradient id="crash-stroke" gradientUnits="userSpaceOnUse" x1={PAD.l} x2={w - PAD.r} y1="0" y2="0">
            <stop offset="0" stopColor="#b52a2c" />
            <stop offset="0.6" stopColor="#f5b82e" />
            <stop offset="1" stopColor="#ffe6a6" />
          </linearGradient>
          <linearGradient id="crash-fill" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={PAD.t} y2={h - PAD.b}>
            <stop offset="0" stopColor={crashed ? '#f5703c' : cashed ? '#2fbf71' : '#f5b82e'} stopOpacity="0.32" />
            <stop offset="1" stopColor={crashed ? '#f5703c' : cashed ? '#2fbf71' : '#f5b82e'} stopOpacity="0" />
          </linearGradient>
          <filter id="crash-glow" filterUnits="userSpaceOnUse" x={-40} y={-40} width={w + 80} height={h + 80}>
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {yTicks.map((m) => (
          <g key={`y${m}`}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(m)} y2={y(m)} stroke="rgb(255 255 255 / 0.07)" strokeDasharray={m === 1 ? undefined : '3 5'} />
            <text x={PAD.l - 8} y={y(m) + 4} textAnchor="end" fontSize="11" fill="rgb(255 255 255 / 0.45)" className="tabular">
              {tickLabel(m)}
            </text>
          </g>
        ))}
        {xTicks.map((s) => (
          <text key={`x${s}`} x={x(s * 1000)} y={h - 8} textAnchor="middle" fontSize="11" fill="rgb(255 255 255 / 0.35)" className="tabular">
            {s}s
          </text>
        ))}
        {started && (
          <>
            <path d={area} fill="url(#crash-fill)" />
            <path d={line} fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" filter="url(#crash-glow)" />
            <path d={line} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {flying && (
              <g transform={`translate(${hx} ${hy})`}>
                <circle r="14" fill="#f5b82e" opacity="0.35" className="crash-halo" />
                <circle r="11" fill="#f5b82e" opacity="0.45" filter="url(#crash-glow)" />
                <g transform={`rotate(${angle})`}>
                  {/* A small rocket pointing along the curve. */}
                  <path d="M-12 0 L-19 -4 L-17 0 L-19 4 Z" fill="#ff8a4c" opacity="0.9" />
                  <path d="M-11 -4.5 L5 -4.5 Q13 -2 14 0 Q13 2 5 4.5 L-11 4.5 Q-13 0 -11 -4.5 Z" fill="#ffe6a6" />
                  <circle cx="4" cy="0" r="1.8" fill="#8d191a" />
                  <path d="M-8 -4.5 L-13 -9 L-4 -4.5 Z M-8 4.5 L-13 9 L-4 4.5 Z" fill="#b52a2c" />
                </g>
              </g>
            )}
            {cashed && <circle cx={hx} cy={hy} r="7" fill="#2fbf71" stroke="#0c0c0f" strokeWidth="2" />}
            {crashed && (
              <g transform={`translate(${hx} ${hy})`}>
                <circle r="9" fill="#f5703c" />
                {live && SPARKS.map((s, i) => (
                  <circle key={i} r={s.r} fill={i % 2 ? '#f5b82e' : '#f5703c'} className="crash-spark" style={{ '--sx': `${s.sx}px`, '--sy': `${s.sy}px` }} />
                ))}
              </g>
            )}
          </>
        )}
      </svg>
      {crashed && live && <div className="crash-flash" style={{ '--fx': `${(hx / w) * 100}%`, '--fy': `${(hy / h) * 100}%` }} aria-hidden="true" />}
      <Confetti burst={celebrate} x={50} y={40} />
      {/* Upper middle: the curve stays low through the center, so it rarely runs under the number. */}
      <div className="pointer-events-none absolute inset-x-0 top-[13%] flex flex-col items-center px-4 text-center sm:top-[17%]">
        <p className={`crash-num font-mono font-black tabular ${cashed ? 'fx-pop' : ''}`} style={{ color: numColor, '--size': numSize }}>
          {label}
        </p>
        <div className="mt-2 min-h-5 text-sm font-semibold">
          {crashed && <p className="tracking-wide text-no uppercase">Crashed</p>}
          {cashed && (
            <p className="text-yes">
              Cashed out <span className="text-white/60">· crashed at {formatMult(result.crash)}</span>
            </p>
          )}
          {flying && bet > 0 && <p className="text-white/70 tabular">{formatCurrency(roundMoney(bet * Math.max(1, mult)))}</p>}
          {phase === 'idle' && <p className="font-normal text-white/60">Place a bet to launch</p>}
        </div>
        <WinPop pop={cashed && live && result?.payout ? { id: `${result.cashout}-${result.crash}`, text: `+${formatCurrency(roundMoney(result.payout - bet))}` } : null} className="mt-2" />
      </div>
    </div>
  )
}
