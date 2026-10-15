/** Outcome chip. Uses a +/- glyph and text so it never relies on color alone. */
export default function SideBadge({ side, label }) {
  const yes = side === 'yes'
  return (
    <span
      className={`inline-flex max-w-[10rem] items-center gap-1 truncate rounded-md px-2 py-0.5 text-xs font-bold ${
        yes ? 'bg-yes-soft text-yes' : 'bg-no-soft text-no'
      }`}
    >
      <span aria-hidden="true">{yes ? '▲' : '▼'}</span>
      {label ?? (yes ? 'Yes' : 'No')}
    </span>
  )
}
