import { useId, useRef } from 'react'

/** WAI-ARIA tablist with arrow-key navigation. */
export default function Tabs({ tabs, value, onChange, label, size = 'md', className = '' }) {
  const refs = useRef([])
  const base = useId()
  const onKeyDown = (e, i) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const next = (i + dir + tabs.length) % tabs.length
    refs.current[next]?.focus()
    onChange(tabs[next].id)
  }
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 ${className}`}>
      {tabs.map((tab, i) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => (refs.current[i] = el)}
            id={`${base}-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`rounded-lg font-medium whitespace-nowrap transition ${pad} ${
              active ? 'bg-primary-500 text-white' : 'text-muted hover:bg-surface-3 hover:text-fg'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`ml-1.5 tabular ${active ? 'text-white/75' : 'text-subtle'}`}>{tab.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
