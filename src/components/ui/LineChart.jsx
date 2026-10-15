import { useEffect, useId, useMemo, useRef, useState } from 'react'

const PAD = { top: 12, right: 48, bottom: 22, left: 8 }

function niceTicks(min, max, count = 4) {
  const span = max - min || 1
  const step = span / count
  return Array.from({ length: count + 1 }, (_, i) => min + step * i)
}

/**
 * Lightweight responsive SVG line chart with an area fill and a hover
 * crosshair. data is [{ t, v }] sorted by t.
 */
export default function LineChart({
  data,
  height = 260,
  color = 'var(--color-primary-300)',
  domain,
  formatValue = (v) => v.toFixed(2),
  formatTime = (t) => new Date(t).toLocaleDateString(),
  label,
}) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState(null)
  const gradientId = useId()

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geo = useMemo(() => {
    if (!data || data.length < 2) return null
    const t0 = data[0].t
    const t1 = data[data.length - 1].t
    let [lo, hi] = domain ?? [Math.min(...data.map((d) => d.v)), Math.max(...data.map((d) => d.v))]
    if (!domain) {
      const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.02 || 1
      lo -= pad
      hi += pad
    }
    const innerW = width - PAD.left - PAD.right
    const innerH = height - PAD.top - PAD.bottom
    const x = (t) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * innerW
    const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * innerH
    const pts = data.map((d) => [x(d.t), y(d.v)])
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
    const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${PAD.top + innerH}L${pts[0][0].toFixed(1)},${PAD.top + innerH}Z`
    return { x, y, lo, hi, line, area, pts, innerH, ticks: niceTicks(lo, hi) }
  }, [data, domain, width, height])

  const onMove = (e) => {
    if (!geo) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    let lo = 0
    let hi = geo.pts.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (geo.pts[mid][0] < px) lo = mid
      else hi = mid
    }
    const idx = Math.abs(geo.pts[lo][0] - px) < Math.abs(geo.pts[hi][0] - px) ? lo : hi
    setHover(idx)
  }

  if (!geo) {
    return (
      <div className="grid place-items-center text-sm text-muted" style={{ height }}>
        Not enough data to chart yet.
      </div>
    )
  }

  const last = data[data.length - 1]
  const active = hover !== null ? data[hover] : null
  const activePt = hover !== null ? geo.pts[hover] : null

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}. Latest value ${formatValue(last.v)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="block touch-pan-y"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {geo.ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--color-line)" strokeDasharray="3 4" />
            <text x={width - PAD.right + 8} y={geo.y(v) + 4} fill="var(--color-subtle)" fontSize="11" className="tabular">
              {formatValue(v)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={height - 4} fill="var(--color-subtle)" fontSize="11">
          {formatTime(data[0].t)}
        </text>
        <text x={width - PAD.right} y={height - 4} fill="var(--color-subtle)" fontSize="11" textAnchor="end">
          {formatTime(last.t)}
        </text>
        <path d={geo.area} fill={`url(#${gradientId})`} />
        <path d={geo.line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {activePt ? (
          <>
            <line x1={activePt[0]} x2={activePt[0]} y1={PAD.top} y2={PAD.top + geo.innerH} stroke="var(--color-line-strong)" />
            <circle cx={activePt[0]} cy={activePt[1]} r="4.5" fill={color} stroke="var(--color-canvas)" strokeWidth="2" />
          </>
        ) : (
          <circle cx={geo.pts[geo.pts.length - 1][0]} cy={geo.pts[geo.pts.length - 1][1]} r="4" fill={color} />
        )}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(activePt[0] - 60, 0), width - 130) }}
        >
          <span className="font-semibold tabular">{formatValue(active.v)}</span>
          <span className="ml-2 text-muted">{formatTime(active.t)}</span>
        </div>
      )}
    </div>
  )
}
