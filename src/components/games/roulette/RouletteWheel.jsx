import { useEffect, useRef } from 'react'
import { colorOf, WHEEL_ORDER } from '../../../games/roulette.js'
import { rouletteSounds } from '../../../games/sounds/roulette.js'

const STEP = 360 / WHEEL_ORDER.length
export const SPIN_MS = 5800
export const QUICK_SPIN_MS = 2400
const FILL = { red: '#b3202a', black: '#18181b', green: '#138a43' }
const TRACK_R = 93
const POCKET_R = 66

const rad = (deg) => (deg * Math.PI) / 180
const pt = (r, deg) => [r * Math.sin(rad(deg)), -r * Math.cos(rad(deg))]
const f = (n) => n.toFixed(2)

/** Ring segment between radii r1 < r2 and angles a < b (degrees clockwise from the top). */
function sector(r1, r2, a, b) {
  const [x1, y1] = pt(r2, a)
  const [x2, y2] = pt(r2, b)
  const [x3, y3] = pt(r1, b)
  const [x4, y4] = pt(r1, a)
  return `M${f(x1)} ${f(y1)}A${r2} ${r2} 0 0 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${r1} ${r1} 0 0 0 ${f(x4)} ${f(y4)}Z`
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3
const easeOutQuart = (t) => 1 - (1 - t) ** 4
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const POCKETS = WHEEL_ORDER.map((n, i) => {
  const a = i * STEP - STEP / 2
  const b = i * STEP + STEP / 2
  return { n, angle: i * STEP, outer: sector(72, 86, a, b), inner: sector(60, 72, a, b), fill: FILL[colorOf(n)] }
})
const FRETS = WHEEL_ORDER.map((_, i) => {
  const a = i * STEP - STEP / 2
  const [x1, y1] = pt(60, a)
  const [x2, y2] = pt(86, a)
  return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`
}).join('')
const TOP_POCKET = sector(60, 86, -STEP / 2, STEP / 2)
const DEFLECTORS = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]

/**
 * European wheel (SVG). Each time `spinKey` changes, the wheel spins
 * clockwise and the ball runs the other way, drops off the track, rattles
 * over the frets and settles in the `result` pocket at the top. Calls
 * `onDone` when still. `settled` lights the winning pocket and shows the
 * number in the middle.
 */
export default function RouletteWheel({ result, spinKey, onDone, settled = false, quick = false, className = '' }) {
  const wheelRef = useRef(null)
  const ballRef = useRef(null)
  const rotation = useRef(0)
  const onDoneRef = useRef(onDone)
  // Read when a spin starts, so flipping the switch mid-spin doesn't restart it.
  const quickRef = useRef(quick)

  useEffect(() => {
    onDoneRef.current = onDone
    quickRef.current = quick
  })

  useEffect(() => {
    if (!spinKey || result === null || result === undefined) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const quick = quickRef.current
    const duration = reduce ? 900 : quick ? QUICK_SPIN_MS : SPIN_MS
    const from = rotation.current
    const target = -WHEEL_ORDER.indexOf(result) * STEP
    const turns = reduce ? 1 : quick ? 2 : 4
    const to = from + turns * 360 + ((((target - from) % 360) + 360) % 360)
    const ballTravel = (reduce ? 2 : quick ? 4 : 8) * 360
    const start = performance.now()
    let frame = 0
    let lastPocket = null
    let lastTick = 0
    let lastBounce = 1
    if (!reduce) rouletteSounds.launch()

    const draw = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const wheel = from + (to - from) * easeOutCubic(p)
      // The ball circles counter-clockwise, ending at the top (0 degrees)...
      const free = (1 - easeOutQuart(p)) * ballTravel
      // ...and once it drops into a pocket it rides along with the wheel.
      const caught = smoothstep(0.78, 0.94, p)
      const angle = (1 - caught) * free + caught * (wheel - to)
      const q = Math.max(0, (p - 0.6) / 0.4)
      const bounce = Math.abs(Math.cos(q * Math.PI * 2.5))
      const radius = p < 0.6 ? TRACK_R : POCKET_R + (TRACK_R - POCKET_R) * (1 - q) ** 2 * bounce
      const [x, y] = pt(radius, angle)
      wheelRef.current?.setAttribute('transform', `rotate(${f(wheel)})`)
      ballRef.current?.setAttribute('transform', `translate(${f(x)} ${f(y)})`)
      ballRef.current?.setAttribute('opacity', '1')

      if (!reduce) {
        // Sound: a clack each time the ball lands from a bounce, then ticks over the frets.
        if (p >= 0.6) {
          if (bounce < 0.12 && lastBounce >= 0.12 && p < 0.9) rouletteSounds.clack()
          lastBounce = bounce
          const pocket = Math.floor((((angle - wheel) % 360) + 360) % 360 / STEP)
          if (pocket !== lastPocket && now - lastTick > 45 && caught < 0.97) {
            if (lastPocket !== null) rouletteSounds.tick(1 - caught)
            lastTick = now
          }
          lastPocket = pocket
        }
      }

      if (p < 1) frame = requestAnimationFrame(draw)
      else {
        rotation.current = to % 360
        if (!reduce) rouletteSounds.settle()
        onDoneRef.current?.()
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [spinKey, result])

  const showResult = settled && result !== null && result !== undefined

  return (
    <svg viewBox="-112 -112 224 224" className={`aspect-square w-full ${className}`} role="img" aria-label={showResult ? `Wheel, the ball landed on ${result}` : 'Wheel'}>
      <defs>
        <radialGradient id="rw-wood" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#8a5428" />
          <stop offset="70%" stopColor="#4a2a12" />
          <stop offset="100%" stopColor="#2a1708" />
        </radialGradient>
        <radialGradient id="rw-track" cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="#101013" />
          <stop offset="92%" stopColor="#26262c" />
          <stop offset="100%" stopColor="#0b0b0d" />
        </radialGradient>
        <radialGradient id="rw-cone" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#f6d77a" />
          <stop offset="60%" stopColor="#c9962f" />
          <stop offset="100%" stopColor="#7b5718" />
        </radialGradient>
        <radialGradient id="rw-ball" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#b9b9c2" />
        </radialGradient>
        <radialGradient id="rw-gloss" cx="40%" cy="25%" r="75%">
          <stop offset="0%" stopColor="rgb(255 255 255 / 0.16)" />
          <stop offset="45%" stopColor="rgb(255 255 255 / 0.03)" />
          <stop offset="100%" stopColor="rgb(0 0 0 / 0.25)" />
        </radialGradient>
        <filter id="rw-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle r="111" fill="url(#rw-wood)" stroke="#1c0f05" strokeWidth="1" />
      <circle r="104" fill="none" stroke="#c9962f" strokeWidth="0.8" opacity="0.7" />
      <circle r="100" fill="url(#rw-track)" stroke="#c9962f" strokeWidth="1.2" />
      {DEFLECTORS.map((a) => (
        <path key={a} d="M0 -91 L-2.2 -87 L0 -83 L2.2 -87 Z" fill="#e9c46a" opacity="0.85" transform={`rotate(${a})`} />
      ))}
      <g ref={wheelRef}>
        {POCKETS.map((p) => (
          <g key={p.n}>
            <path d={p.outer} fill={p.fill} />
            <path d={p.inner} fill={p.fill} opacity="0.7" />
            <text
              transform={`rotate(${f(p.angle)}) translate(0 -79)`}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="7.5"
              fontWeight="700"
              fill="#fff"
            >
              {p.n}
            </text>
          </g>
        ))}
        <path d={FRETS} stroke="#e3bf62" strokeWidth="0.7" />
        <circle r="86" fill="none" stroke="#d9b45a" strokeWidth="0.8" />
        <circle r="72" fill="none" stroke="#d9b45a" strokeWidth="0.4" opacity="0.7" />
        <circle r="60" fill="none" stroke="#d9b45a" strokeWidth="1" />
        <circle r="48" fill="url(#rw-wood)" stroke="#d9b45a" strokeWidth="1" />
        <circle r="30" fill="url(#rw-cone)" />
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <rect x="-2.5" y="-40" width="5" height="34" rx="2.5" fill="url(#rw-cone)" />
            <circle cy="-41" r="3.4" fill="#f6d77a" stroke="#7b5718" strokeWidth="0.6" />
          </g>
        ))}
        <circle r="7" fill="#f6d77a" stroke="#7b5718" strokeWidth="1" />
      </g>
      <circle r="100" fill="url(#rw-gloss)" pointerEvents="none" />
      {showResult && <path d={TOP_POCKET} fill="none" stroke="#ffe08a" strokeWidth="2" filter="url(#rw-glow)" className="rw-pocket-glow" />}
      <path d="M0 -99 L-5.5 -109 L5.5 -109 Z" fill="#f5b82e" stroke="#7b5718" strokeWidth="0.8" />
      <g ref={ballRef} opacity="0">
        <ellipse cx="1.2" cy="1.6" rx="4.4" ry="3.6" fill="rgb(0 0 0 / 0.45)" />
        <circle r="4.4" fill="url(#rw-ball)" stroke="rgb(0 0 0 / 0.35)" strokeWidth="0.5" />
      </g>
      {showResult && (
        <g key={`${spinKey}-${result}`} className="rw-medal">
          <circle r="27" fill={FILL[colorOf(result)]} stroke="#ffe08a" strokeWidth="2.2" />
          <circle r="23" fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth="0.8" />
          <text textAnchor="middle" dominantBaseline="central" fontSize="24" fontWeight="800" fill="#fff" className="tabular">
            {result}
          </text>
        </g>
      )}
    </svg>
  )
}
