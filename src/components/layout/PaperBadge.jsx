export default function PaperBadge({ compact = false }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-warn uppercase"
      title="RedBook Markets uses play money only. Nothing here has real value."
    >
      <span className="size-1.5 rounded-full bg-warn" aria-hidden="true" />
      {compact ? 'Play money' : 'Paper trading, play money only'}
    </span>
  )
}
