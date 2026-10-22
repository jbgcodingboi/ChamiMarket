/**
 * The Chicken Cross road: lanes of traffic bottom to top, the chicken, and the
 * hit, near-miss and "the car was here" effects. Purely visual: the page tells
 * it which lane the chicken is on and how the round ended.
 */
import { Car, Chicken } from './Sprites.jsx'

export const LANE_H = 76
export const CURB_H = 92
const CAR_COLORS = ['#c0262d', '#2563eb', '#f5b82e', '#7c3aed', '#0d9488', '#ea580c', '#e5e7eb']

/** Short multiplier for the manhole badge: 1.26×, 123.4×, 9.8k×. */
const badge = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}k×` : m >= 100 ? `${m.toFixed(1)}×` : `${m.toFixed(2)}×`)

const laneLook = (n) => {
  const dir = n % 2 ? 'r' : 'l'
  const speed = 2.6 + ((n * 37) % 23) / 10
  const cars = [0, 1].map((k) => ({
    color: CAR_COLORS[(n * 3 + k) % CAR_COLORS.length],
    truck: (n + k) % 5 === 0,
    delay: -((n * 1.7 + k * speed * 0.52) % speed),
  }))
  return { dir, speed, cars }
}

const BG = {
  passed: 'bg-[#2a2614]',
  current: 'bg-[#13321f]',
  hit: 'bg-[#3a1610]',
  next: 'bg-[#1f1f25]',
  ahead: 'bg-[#1d1d22]',
}

const BADGE = {
  passed: 'border-warn/80 bg-warn/25 text-warn',
  current: 'border-yes bg-yes/25 text-yes',
  hit: 'border-no bg-no/30 text-no',
  next: 'ck-next-badge border-white/70 bg-[#141417]/90 text-white',
  ahead: 'border-white/15 bg-[#141417]/85 text-white/85',
}

function Lane({ n, mult, status, traffic, crash, brakeKey, ghost }) {
  const { dir, speed, cars } = laneLook(n)
  return (
    <div className={`relative border-b-2 border-dashed border-white/15 transition-colors duration-300 ${BG[status]} ${status === 'hit' ? 'ck-lane-hit' : ''}`} style={{ height: LANE_H }} data-lane={n}>
      {traffic &&
        cars.map((c, k) => (
          <div key={k} className={`ck-traffic ck-drive-${dir}`} style={{ animationDuration: `${speed}s`, animationDelay: `${c.delay}s` }}>
            <span className="absolute top-1/2 left-0 -translate-y-1/2">
              <Car color={c.color} flip={dir === 'l'} truck={c.truck} />
            </span>
          </div>
        ))}
      {brakeKey !== undefined && (
        <div key={brakeKey} className={`ck-traffic ck-brake-${dir}`}>
          <span className="ck-brake-car absolute top-1/2 left-0 -translate-y-1/2">
            <Car color={cars[0].color} flip={dir === 'l'} />
          </span>
          <span className={`ck-skid ck-skid-${dir}`} aria-hidden="true" />
        </div>
      )}
      {crash && (
        <div className={`absolute top-1/2 z-[3] -translate-y-1/2 crash-in-${dir}`}>
          <Car color="#dc2626" flip={dir === 'l'} />
        </div>
      )}
      {ghost && (
        <div className="ck-ghost absolute inset-y-0 left-1/2 z-[3] flex -translate-x-1/2 items-center gap-2" aria-hidden="true">
          <span className="opacity-70">
            <Car color="#dc2626" flip={dir === 'l'} />
          </span>
          <span className="rounded-md bg-no/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap text-black uppercase">Car was here</span>
        </div>
      )}
      {(status === 'passed' || status === 'current') && (
        <div className="absolute inset-x-0 top-1 flex justify-center gap-1 opacity-80" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <span key={k} className="h-1.5 w-5 rounded-sm bg-[repeating-linear-gradient(90deg,#f5b82e_0_6px,#18181b_6px_12px)]" />
          ))}
        </div>
      )}
      {!ghost && (
        <div className="absolute top-1/2 left-1/2 z-[2] -translate-x-1/2 -translate-y-1/2">
          {status === 'next' && (
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded bg-white px-1 text-[9px] leading-3 font-extrabold tracking-wider text-black uppercase">Next</span>
          )}
          <span className={`flex size-14 items-center justify-center rounded-full border-4 text-[11px] font-bold tabular shadow-inner transition-colors duration-300 ${BADGE[status]}`}>
            {badge(mult)}
          </span>
        </div>
      )}
    </div>
  )
}

function Feathers() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <span className="ck-impact" />
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="feather absolute top-1/2 left-1/2 h-2.5 w-1.5 rounded-full bg-white"
          style={{ '--fx': `${Math.cos(i * 0.53) * 78}px`, '--fy': `${Math.sin(i * 0.53) * 64 - 30}px`, '--fr': `${i * 47}deg` }}
        />
      ))}
    </div>
  )
}

/**
 * mults: lane multipliers. lane: where the chicken stands (0 is the curb).
 * statusOf(n) gives each lane's look. crashAt / ghostLane / brake mark the
 * hit lane, the lane the car was waiting on after a cash out, and a near miss.
 */
export default function Road({ mults, lane, statusOf, crashAt, ghostLane, brake, chickenState, viewH, lead = 1.5, quick }) {
  const lanes = mults.length
  const offset = Math.max(0, Math.min(CURB_H + lanes * LANE_H + 60 - viewH, lane * LANE_H - LANE_H * lead))
  const firstVisible = Math.floor((offset - CURB_H) / LANE_H)
  const lastVisible = Math.ceil((offset + viewH - CURB_H) / LANE_H) + 1
  const bottom = lane === 0 ? CURB_H / 2 - 28 : CURB_H + (lane - 1) * LANE_H + LANE_H / 2 - 24
  return (
    <div className="relative overflow-hidden bg-[#141417] [perspective:1100px]" style={{ height: viewH }}>
      <div className={`origin-bottom [transform:rotateX(14deg)] ${crashAt ? 'ck-shake' : ''}`} style={{ height: viewH }}>
        <div className="absolute inset-x-0 bottom-0 transition-transform ease-out" style={{ transform: `translateY(${offset}px)`, transitionDuration: quick ? '160ms' : '320ms' }}>
          <div className="ck-finish flex h-14 items-center justify-center" aria-hidden="true">
            <span className="rounded bg-black/70 px-2 py-0.5 text-[10px] font-extrabold tracking-[0.3em] text-white uppercase">Finish</span>
          </div>
          <div className="flex flex-col-reverse">
            {mults.map((m, i) => {
              const n = i + 1
              const status = statusOf(n)
              return (
                <Lane
                  key={n}
                  n={n}
                  mult={m}
                  status={status}
                  traffic={(status === 'ahead' || status === 'next') && n >= firstVisible && n <= lastVisible}
                  crash={crashAt === n}
                  brakeKey={brake?.lane === n && status === 'current' ? brake.key : undefined}
                  ghost={ghostLane === n}
                />
              )
            })}
          </div>
          <div className="ck-curb flex items-end justify-center pb-2 text-[11px] font-semibold tracking-[0.25em] text-white/45 uppercase" style={{ height: CURB_H }}>
            Start
          </div>
          <div className="absolute left-1/2 z-10 -translate-x-1/2 transition-[bottom] ease-out" style={{ bottom, transitionDuration: quick ? '110ms' : '200ms' }}>
            <div key={lane} className={lane ? 'chicken-hop' : ''}>
              <div className={chickenState === 'idle' ? 'ck-idle' : ''}>
                <Chicken state={chickenState} />
              </div>
            </div>
            {lane > 0 && !quick && <span key={`dust-${lane}`} className="ck-dust" aria-hidden="true" />}
            {crashAt && <Feathers />}
          </div>
        </div>
      </div>
    </div>
  )
}
