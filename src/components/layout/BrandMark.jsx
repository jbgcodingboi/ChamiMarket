/** Varsity-style block "C" on the brand red tile. */
const C_PATH = 'M30 3H70L86 19V37H62L56 31H48L44 35V65L48 69H56L62 63H86V81L70 97H30L14 81V19Z'

export default function BrandMark({ className = 'size-8', rounded = 22 }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect width="100" height="100" rx={rounded} fill="var(--color-primary-500)" />
      <path
        transform="translate(50 50) scale(0.78) translate(-50 -50)"
        d={C_PATH}
        fill="var(--color-brand-gold)"
        stroke="var(--color-brand-red-outline)"
        strokeWidth="5"
        strokeLinejoin="miter"
        paintOrder="stroke"
      />
    </svg>
  )
}
