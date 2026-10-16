import { useEffect, useRef } from 'react'
import { colorOf, WHEEL_ORDER } from '../../../games/roulette.js'

const STEP = 360 / WHEEL_ORDER.length
const SPIN_MS = 5800
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

/**
 * European wheel (SVG). Each time `spinKey` changes, the wheel spins
 * clockwise and the ball runs the other way, drops off the track, rattles
 * and settles in the `result` pocket at the top. Calls `onDone` when still.
 */
export default function RouletteWheel({ result, spinKey, onDone }) {
  const wheelRef = useRef(null)
  const ballRef = useRef(null)
  const rotation = useRef(0)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  })

  useEffect(() => {
    if (!spinKey || result === null || result === undefined) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const duration = reduce ? 900 : SPIN_MS
    const from = rotation.current
    const target = -WHEEL_ORDER.indexOf(result) * STEP
    const to = from + (reduce ? 360 : 4 * 360) + ((((target - from) % 360) + 360) % 360)
    const ballTravel = (reduce ? 2 : 8) * 360
    const start = performance.now()
    let frame = 0

    const draw = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const wheel = from + (to - from) * easeOutCubic(p)
      // The ball circles counter-clockwise, ending at the top (0 degrees)...
      const free = (1 - easeOutQuart(p)) * ballTravel
      // ...and once it drops into a pocket it rides along with the wheel.
      const caught = smoothstep(0.78, 0.94, p)
      const angle = (1 - caught) * free + caught * (wheel - to)
      const q = Math.max(0, (p - 0.6) / 0.4)
      const radius = p < 0.6 ? TRACK_R : POCKET_R + (TRACK_R - POCKET_R) * (1 - q) ** 2 * Math.abs(Math.cos(q * Math.PI * 2.5))
      const [x, y] = pt(radius, angle)
      wheelRef.current?.setAttribute('transform', `rotate(${f(wheel)})`)
      ballRef.current?.setAttribute('transform', `translate(${f(x)} ${f(y)})`)
      ballRef.current?.setAttribute('opacity', '1')
      if (p < 1) frame = requestAnimationFrame(draw)
      else {
        rotation.current = to % 360
        onDoneRef.current?.()
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [spinKey, result])

  return (
    <svg viewBox="-112 -112 224 224" className="mx-auto aspect-square w-full max-w-[22rem] drop-shadow-2xl" role="img" aria-label="Roulette wheel">
      <defs>
        <radialGradient id="rw-wood" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#7a4a22" />
          <stop offset="100%" stopColor="#3a210e" />
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
      </defs>
      <circle r="110" fill="url(#rw-wood)" />
      <circle r="100" fill="#141417" stroke="#c9962f" strokeWidth="1.2" />
      <circle r="88" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="1" />
      <g ref={wheelRef}>
        {POCKETS.map((p) => (
          <g key={p.n}>
            <path d={p.outer} fill={p.fill} stroke="#d9b45a" strokeWidth="0.5" />
            <path d={p.inner} fill={p.fill} stroke="#d9b45a" strokeWidth="0.5" opacity="0.72" />
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
        <circle r="60" fill="none" stroke="#d9b45a" strokeWidth="1" />
        <circle r="48" fill="url(#rw-wood)" stroke="#d9b45a" strokeWidth="1" />
        <circle r="30" fill="url(#rw-cone)" />
        {[0, 90, 180, 270].map((a) => (
          <rect key={a} x="-2.5" y="-40" width="5" height="34" rx="2.5" fill="url(#rw-cone)" transform={`rotate(${a})`} />
        ))}
        <circle r="7" fill="#f6d77a" stroke="#7b5718" strokeWidth="1" />
      </g>
      <path d="M0 -99 L-5 -108 L5 -108 Z" fill="#f5b82e" stroke="#7b5718" strokeWidth="0.8" />
      <g ref={ballRef} opacity="0">
        <circle r="4.4" fill="url(#rw-ball)" stroke="rgb(0 0 0 / 0.35)" strokeWidth="0.5" />
      </g>
    </svg>
  )
}
