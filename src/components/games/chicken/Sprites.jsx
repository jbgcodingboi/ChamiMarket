/** The chicken and the traffic, as inline SVG. */

export function Chicken({ state }) {
  return (
    <svg
      viewBox="0 0 60 60"
      className={`size-14 drop-shadow-[0_6px_6px_rgb(0_0_0/0.45)] ${state === 'hit' ? 'chicken-squash' : state === 'won' ? 'chicken-cheer' : ''}`}
      aria-hidden="true"
    >
      <ellipse cx="30" cy="55" rx="14" ry="3" fill="rgb(0 0 0 / 0.3)" />
      <path d="M24 50v4M36 50v4M21 54h6M33 54h6" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="30" cy="36" rx="17" ry="15" fill="#fdfbf7" />
      <path d="M14 34c-4-2-6 2-4 6 2 3 6 3 8 1" fill="#f1ede4" />
      <ellipse cx="38" cy="38" rx="7" ry="5" fill="#ece6d8" />
      <circle cx="30" cy="20" r="11" fill="#fdfbf7" />
      <path d="M24 10c1-4 4-5 6-3 1-3 5-3 6 0 3-1 5 2 3 5Z" fill="#dc2626" />
      <path d="M39 20l7 2-7 3Z" fill="#f59e0b" />
      <path d="M38 26c2 2 1 5-1 6-2-1-2-4 1-6Z" fill="#dc2626" />
      {state === 'hit' ? (
        <path d="M31 16l4 4M35 16l-4 4" stroke="#1c1917" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="33" cy="18" r="2" fill="#1c1917" />
          <circle cx="33.6" cy="17.4" r="0.6" fill="#fff" />
        </>
      )}
    </svg>
  )
}

export function Car({ color, flip, truck = false }) {
  if (truck) {
    return (
      <svg viewBox="0 0 92 38" className={`h-10 w-[5.75rem] ${flip ? '-scale-x-100' : ''}`} aria-hidden="true">
        <rect x="2" y="4" width="62" height="25" rx="3" fill="#e5e7eb" />
        <rect x="6" y="8" width="54" height="3" rx="1.5" fill={color} opacity="0.85" />
        <path d="M66 10h14l9 9v10H66Z" fill={color} />
        <path d="M70 13h9l6 6H70Z" fill="#bfdbfe" opacity="0.85" />
        <rect x="85" y="21" width="5" height="5" rx="1.5" fill="#fef08a" />
        <rect x="3" y="18" width="3" height="6" rx="1" fill="#f87171" />
        {[16, 32, 78].map((x) => (
          <g key={x}>
            <circle cx={x} cy="31" r="5" fill="#18181b" />
            <circle cx={x} cy="31" r="2" fill="#71717a" />
          </g>
        ))}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 34" className={`h-9 w-16 ${flip ? '-scale-x-100' : ''}`} aria-hidden="true">
      <rect x="2" y="9" width="60" height="18" rx="7" fill={color} />
      <path d="M16 9l6-7h18l8 7Z" fill={color} />
      <path d="M22 4h8v5h-11Z M33 4h6l5 5H33Z" fill="#bfdbfe" opacity="0.85" />
      <rect x="56" y="13" width="5" height="5" rx="1.5" fill="#fef08a" />
      <rect x="3" y="13" width="3" height="5" rx="1" fill="#f87171" />
      <circle cx="16" cy="28" r="5" fill="#18181b" />
      <circle cx="48" cy="28" r="5" fill="#18181b" />
      <circle cx="16" cy="28" r="2" fill="#71717a" />
      <circle cx="48" cy="28" r="2" fill="#71717a" />
    </svg>
  )
}
