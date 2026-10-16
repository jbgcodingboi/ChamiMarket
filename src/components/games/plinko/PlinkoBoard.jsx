import { useEffect, useImperativeHandle, useRef } from 'react'
import { BALL_R, BUCKET_H, bucketTop, DROP_FROM, flightPlan, GRAVITY, heightUnits, PIN_R, pinX, ROW_H, widthUnits } from '../../../games/plinkoPhysics.js'

const MAX_HEIGHT_PX = 620

function bucketColor(k, rows) {
  const d = Math.abs(k - rows / 2) / (rows / 2)
  const hue = 48 - 48 * d
  return { fill: `hsl(${hue} 88% ${52 - d * 6}%)`, text: d > 0.55 ? '#fff' : '#1c1917' }
}

const multLabel = (m) => (m >= 1000 ? `${m / 1000}K` : `${m}`)

/**
 * Canvas Plinko board. Call `drop({ id, path })` through the ref to launch a
 * ball; `onLand(id, bucket)` fires when it drops into its bucket.
 */
export default function PlinkoBoard({ ref, rows, multipliers, onLand }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const sim = useRef({ balls: [], flashes: new Map(), pulses: new Map(), frame: 0, size: { w: 0, s: 0, h: 0 } })
  const onLandRef = useRef(onLand)
  const drawRef = useRef(null)

  useEffect(() => {
    onLandRef.current = onLand
  })

  useEffect(() => {
    const state = sim.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const layout = () => {
      const w = wrapRef.current.clientWidth
      const s = Math.min(w / widthUnits(rows), MAX_HEIGHT_PX / heightUnits(rows))
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
          if (hit) state.flashes.set(`${hit.row}-${hit.j}`, now)
          i++
        }
        ball.seg = i
        if (t >= ball.plan.duration) {
          landed.push(ball)
          continue
        }
        const seg = ball.plan.segments[i]
        const dt = t - seg.t0
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

      // Pins, glowing briefly when hit.
      for (let r = 0; r < rows; r++) {
        for (let j = 0; j < r + 3; j++) {
          const since = now - (state.flashes.get(`${r}-${j}`) ?? -1e9)
          const glow = since < 320 ? 1 - since / 320 : 0
          ctx.beginPath()
          ctx.arc(X(pinX(r, j)), Y(r * ROW_H), PIN_R * s * (1 + glow * 0.6), 0, Math.PI * 2)
          ctx.fillStyle = glow ? `rgba(245, 184, 46, ${0.55 + glow * 0.45})` : 'rgba(237, 237, 240, 0.85)'
          ctx.shadowColor = glow ? 'rgba(245, 184, 46, 0.9)' : 'transparent'
          ctx.shadowBlur = glow ? 10 * glow : 0
          ctx.fill()
        }
      }
      ctx.shadowBlur = 0

      // Buckets, which dip when a ball lands.
      const top = bucketTop(rows)
      const bw = 0.9 * s
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      multipliers.forEach((m, k) => {
        const since = now - (state.pulses.get(k) ?? -1e9)
        const dip = since < 360 ? Math.sin((since / 360) * Math.PI) * 0.18 * s : 0
        const x = X(k - rows / 2) - bw / 2
        const y = Y(top) + dip
        const bh = BUCKET_H * s
        const { fill, text } = bucketColor(k, rows)
        ctx.fillStyle = fill
        ctx.globalAlpha = since < 360 ? 1 : 0.92
        ctx.beginPath()
        ctx.roundRect(x, y, bw, bh, Math.min(6, s * 0.18))
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
        ctx.fillRect(x, y + bh - Math.max(2, s * 0.08), bw, Math.max(2, s * 0.08))
        let size = Math.max(7, s * 0.34)
        const label = multLabel(m)
        ctx.font = `700 ${size}px Inter, system-ui, sans-serif`
        while (ctx.measureText(label).width > bw - 3 && size > 6) {
          size -= 0.5
          ctx.font = `700 ${size}px Inter, system-ui, sans-serif`
        }
        ctx.fillStyle = text
        ctx.fillText(label, x + bw / 2, y + bh / 2)
      })

      // Balls on top.
      for (const ball of state.balls) {
        if (ball.x === undefined) continue
        const bx = X(ball.x)
        const by = Y(ball.y)
        const g = ctx.createRadialGradient(bx - BALL_R * s * 0.35, by - BALL_R * s * 0.35, 1, bx, by, BALL_R * s)
        g.addColorStop(0, '#ffe6a6')
        g.addColorStop(1, '#e0a020')
        ctx.beginPath()
        ctx.arc(bx, by, BALL_R * s, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.shadowColor = 'rgba(245, 184, 46, 0.7)'
        ctx.shadowBlur = 8
        ctx.fill()
        ctx.shadowBlur = 0
      }

      const lastFx = Math.max(0, ...state.flashes.values(), ...state.pulses.values())
      if (state.balls.length || now - lastFx < 400) state.frame = requestAnimationFrame(draw)
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
        sim.current.balls.push({ id, plan: flightPlan(path), start: performance.now(), seg: 0 })
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
