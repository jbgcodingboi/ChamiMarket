import { useSoundStore } from '../../games/sound.js'

/** Mute switch for the game sounds. */
export default function SoundToggle() {
  const muted = useSoundStore((s) => s.muted)
  const toggle = useSoundStore((s) => s.toggle)
  return (
    <button type="button" onClick={toggle} aria-pressed={!muted} className="btn btn-ghost shrink-0 px-3 text-xs whitespace-nowrap" title={muted ? 'Sound is off' : 'Sound is on'}>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {muted ? <path d="m16 9 5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
      {muted ? 'Sound off' : 'Sound on'}
    </button>
  )
}
