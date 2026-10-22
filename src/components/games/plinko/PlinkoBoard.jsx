import { useEffect, useImperativeHandle, useRef } from 'react'
import { BALL_R, BUCKET_H, bucketTop, DROP_FROM, flightPlan, GRAVITY, heightUnits, PIN_R, pinX, ROW_H } from '../../../games/plinkoPhysics.js'
import { reducedMotion } from '../limbo/fx.js'
import { bucketColor, multLabel } from './colors.js'

const MAX_HEIGHT_PX = 620
/** Board width in pin spacings: the bottom row of pins plus a small margin (tighter than the physics width, so phones get bigger buckets). */
const viewUnits = (rows) => rows + 1.7
const PIN_GLOW_MS = 320
const BUCKET_GLOW_MS = 650
const TRAIL = 5

/**
 * Canvas Plinko board. Call `drop({ id, path })` through the ref to launch a
 * ball; `onLand(id, bucket)` fires when it drops into its bucket and
 * `onPeg(row)` each time a ball hits a pin.
 */
export default function PlinkoBoard({ ref, rows, multipliers, onLand, onPeg }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const sim = useRef({ balls: [], flashes: new Map(), pulses: new Map(), frame: 0, size: { w: 0, s: 0, h: 0 } })
  const onLandRef = useRef(onLand)
  const onPegRef = useRef(onPeg)
  const drawRef = useRef(null)

  useEffect(() => {
    onLandRef.current = onLand
    onPegRef.current = onPeg
  })

  useEffect(() => {
    const state = sim.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const calm = reducedMotion()
    const colors = multipliers.map((_, k) => bucketColor(k, rows))

    const layout = () => {
      const w = wrapRef.current.clientWidth
      const s = Math.min(w / viewUnits(rows), MAX_HEIGHT_PX / heightUnits(rows))
      const h = Math.round(heightUnits(rows) * s)
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      state.size = { w, s, h }
    }

    const draw = (now) => {
      const { w, s, h } = state.size
      const ox = w / 2
      const oy = (-DROP_FROM + 0.4) * s
      const X = (x) => ox + x * s
      const Y = (y) => oy + y * s
      ctx.clearRect(0, 0, w, h)

      // Balls: advance along their flight plans.
      const landed = []
      for (const ball of state.balls) {
        const t = (now - ball.start) / 1000
        let i = ball.seg
        while (i < ball.plan.segments.length - 1 && t >= ball.plan.segments[i + 1].t0) {
          const hit = ball.plan.segments[i].hit
          if (hit) {
            state.flashes.set(`${hit.row}-${hit.j}`, now)
            onPegRef.current?.(hit.row)
          }
          i++
        }
        ball.seg = i
        if (t >= ball.plan.duration) {
          landed.push(ball)
          continue
        }
        const seg = ball.plan.segments[i]
        const dt = t - seg.t0
        if (ball.x !== undefined && !calm) {
          ball.trail.push([ball.x, ball.y])
          if (ball.trail.length > TRAIL) ball.trail.shift()
        }
        ball.x = seg.x0 + seg.vx * dt
        ball.y = seg.y0 + seg.vy * dt + (GRAVITY * dt * dt) / 2
      }
      if (landed.length) {
        state.balls = state.balls.filter((b) => !landed.includes(b))
        for (const b of landed) {
          state.pulses.set(b.plan.bucket, now)
          onLandRef.current?.(b.id, b.plan.bucket)
        }
      }

      const top = bucketTop(rows)
      const bw = 0.9 * s
      const bh = BUCKET_H * s

      // Light beams rising from buckets that just caught a ball.
      if (!calm) {
        for (const [k, at] of state.pulses) {
          const since = now - at
          if (since >= BUCKET_GLOW_MS) continue
          const a = 1 - since / BUCKET_GLOW_MS
          const x = X(k - rows / 2) - bw / 2
          const beamH = 3.2 * s
          const g = ctx.createLinearGradient(0, Y(top) - beamH, 0, Y(top))
          g.addColorStop(0, 'rgba(0,0,0,0)')
          g.addColorStop(1, `hsla(${colors[k].hue}, 95%, 60%, ${0.32 * a})`)
          ctx.fillStyle = g
          ctx.fillRect(x, Y(top) - beamH, bw, beamH)
        }
      }

      // Pins, glowing briefly when hit.
      for (let r = 0; r < rows; r++) {
        for (let j = 0; j < r + 3; j++) {
          const since = now - (state.flashes.get(`${r}-${j}`) ?? -1e9)
          const glow = since < PIN_GLOW_MS ? 1 - since / PIN_GLOW_MS : 0
          ctx.beginPath()
          ctx.arc(X(pinX(r, j)), Y(r * ROW_H), PIN_R * s * (1 + glow * 0.6), 0, Math.PI * 2)
          ctx.fillStyle = glow ? `rgba(255, 214, 120, ${0.6 + glow * 0.4})` : 'rgba(237, 237, 240, 0.82)'
          ctx.shadowColor = glow ? 'rgba(245, 184, 46, 0.95)' : 'transparent'
          ctx.shadowBlur = glow ? 12 * glow : 0
          ctx.fill()
        }
      }
      ctx.shadowBlur = 0

      // Buckets: they dip and glow in their own color when a ball lands.
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      multipliers.forEach((m, k) => {
        const since = now - (state.pulses.get(k) ?? -1e9)
        const hot = since < BUCKET_GLOW_MS ? 1 - since / BUCKET_GLOW_MS : 0
        const dip = since < 360 ? Math.sin((since / 360) * Math.PI) * 0.2 * s : 0
        const x = X(k - rows / 2) - bw / 2
        const y = Y(top) + dip
        const c = colors[k]
        const radius = Math.min(6, s * 0.2)
        const g = ctx.createLinearGradient(0, y, 0, y + bh)
        g.addColorStop(0, c.top)
        g.addColorStop(1, c.fill)
        ctx.fillStyle = g
        ctx.globalAlpha = hot ? 1 : 0.9
        if (hot) {
          ctx.shadowColor = c.glow
          ctx.shadowBlur = 22 * hot
        }
        ctx.beginPath()
        ctx.roundRect(x, y, bw, bh, radius)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
        if (hot) {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * hot})`
          ctx.beginPath()
          ctx.roundRect(x, y, bw, bh, radius)
          ctx.fill()
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
        ctx.fillRect(x + radius / 2, y + bh - Math.max(2, s * 0.08), bw - radius, Math.max(2, s * 0.08))
        let size = Math.max(8, s * 0.36) * (1 + hot * 0.12)
        const label = multLabel(m)
        ctx.font = `800 ${size}px Inter, system-ui, sans-serif`
        while (ctx.measureText(label).width > bw - 2 && size > 6) {
          size -= 0.5
          ctx.font = `800 ${size}px Inter, system-ui, sans-serif`
        }
        ctx.fillStyle = c.text
        ctx.fillText(label, x + bw / 2, y + bh / 2 + 0.5)
      })

      // Balls on top, each with a short fading trail.
      for (const ball of state.balls) {
        if (ball.x === undefined) continue
        ball.trail.forEach(([tx, ty], i) => {
          ctx.beginPath()
          ctx.arc(X(tx), Y(ty), BALL_R * s * (0.45 + (i / TRAIL) * 0.4), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(245, 184, 46, ${0.06 + (i / TRAIL) * 0.16})`
          ctx.fill()
        })
        const bx = X(ball.x)
        const by = Y(ball.y)
        const g = ctx.createRadialGradient(bx - BALL_R * s * 0.35, by - BALL_R * s * 0.35, 1, bx, by, BALL_R * s)
        g.addColorStop(0, '#fff3cf')
        g.addColorStop(0.45, '#ffd76a')
        g.addColorStop(1, '#e0a020')
        ctx.beginPath()
        ctx.arc(bx, by, BALL_R * s, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.shadowColor = 'rgba(245, 184, 46, 0.75)'
        ctx.shadowBlur = 10
        ctx.fill()
        ctx.shadowBlur = 0
      }

      const lastFx = Math.max(0, ...state.flashes.values(), ...state.pulses.values())
      if (state.balls.length || now - lastFx < BUCKET_GLOW_MS + 50) state.frame = requestAnimationFrame(draw)
      else state.frame = 0
    }

    const kick = () => {
      if (!state.frame) state.frame = requestAnimationFrame(draw)
    }
    drawRef.current = kick
    layout()
    kick()
    const ro = new ResizeObserver(() => {
      layout()
      cancelAnimationFrame(state.frame)
      state.frame = 0
      kick()
    })
    ro.observe(wrapRef.current)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(state.frame)
      state.frame = 0
    }
  }, [rows, multipliers])

  useImperativeHandle(
    ref,
    () => ({
      drop({ id, path }) {
        sim.current.balls.push({ id, plan: flightPlan(path), start: performance.now(), seg: 0, trail: [] })
        drawRef.current?.()
      },
    }),
    [],
  )

  return (
    <div ref={wrapRef} className="w-full">
      <canvas ref={canvasRef} className="block w-full" role="img" aria-label={`Plinko board with ${rows} rows of pins and ${rows + 1} payout buckets`} />
    </div>
  )
}
