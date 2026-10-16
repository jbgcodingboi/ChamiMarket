import { useId } from 'react'
import { formatSignedCurrency, pnlTone } from '../../utils/format.js'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function OnResult({ label, mode, pct, onMode, onPct, disabled }) {
  const id = useId()
  return (
    <div>
      <p id={id} className="text-xs font-medium text-muted">
        {label}
      </p>
      <div className="mt-1.5 flex gap-1" role="group" aria-labelledby={id}>
        {['reset', 'increase'].map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            aria-pressed={mode === m}
            onClick={() => onMode(m)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mode === m ? 'bg-surface-3 text-fg' : 'bg-surface-2 text-muted hover:text-fg'}`}
          >
            {m === 'reset' ? 'Reset' : 'Increase by'}
          </button>
        ))}
        <div className="relative flex-1">
          <input
            type="number"
            min="0"
            className="input py-1.5 pr-6 text-sm tabular"
            value={pct}
            disabled={disabled || mode === 'reset'}
            onChange={(e) => onPct(e.target.value)}
            aria-label={`${label} increase percent`}
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted">%</span>
        </div>
      </div>
    </div>
  )
}

/** Auto-bet settings: number of bets, sizing after wins and losses, and stop limits. */
export function AutoSettings({ settings, onChange, disabled, stats, running, children }) {
  const set = (patch) => onChange({ ...settings, ...patch })
  return (
    <div className="space-y-3">
      {children}
      <Field label="Number of bets (0 for no limit)">
        <input type="number" min="0" className="input tabular" value={settings.count} disabled={disabled} onChange={(e) => set({ count: e.target.value })} />
      </Field>
      <OnResult label="On win" mode={settings.onWin} pct={settings.winPct} onMode={(onWin) => set({ onWin })} onPct={(winPct) => set({ winPct })} disabled={disabled} />
      <OnResult label="On loss" mode={settings.onLoss} pct={settings.lossPct} onMode={(onLoss) => set({ onLoss })} onPct={(lossPct) => set({ lossPct })} disabled={disabled} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Stop on profit">
          <input type="number" min="0" placeholder="Off" className="input tabular" value={settings.stopProfit} disabled={disabled} onChange={(e) => set({ stopProfit: e.target.value })} />
        </Field>
        <Field label="Stop on loss">
          <input type="number" min="0" placeholder="Off" className="input tabular" value={settings.stopLoss} disabled={disabled} onChange={(e) => set({ stopLoss: e.target.value })} />
        </Field>
      </div>
      <button
        type="button"
        className="text-xs font-medium text-primary-300 hover:underline disabled:opacity-50"
        disabled={disabled}
        onClick={() => set({ onWin: 'reset', winPct: '0', onLoss: 'increase', lossPct: '100' })}
      >
        Use Martingale (double after a loss, reset after a win)
      </button>
      {(running || stats.played > 0) && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted tabular" aria-live="polite">
          {stats.played} bet{stats.played === 1 ? '' : 's'} · profit <span className={pnlTone(stats.profit)}>{formatSignedCurrency(stats.profit)}</span>
        </p>
      )}
    </div>
  )
}
