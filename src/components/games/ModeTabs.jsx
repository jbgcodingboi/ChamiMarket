/** Manual / Auto switch used by the game control panels. */
export default function ModeTabs({ value, onChange, disabled }) {
  return (
    <div role="tablist" aria-label="Play mode" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
      {[
        ['manual', 'Manual'],
        ['auto', 'Auto'],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          disabled={disabled}
          onClick={() => onChange(id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${value === id ? 'bg-surface-3 text-fg shadow' : 'text-muted hover:text-fg'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
