import { useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useLegalStore } from '../../store/legalStore.js'
import Modal from '../ui/Modal.jsx'

const POINTS = [
  {
    title: 'Unofficial fan site',
    body: 'Chami Market is not affiliated with, endorsed, sponsored or approved by Chaminade High School, the Marianists, or any school, team, league, company or data source named here. Names belong to their owners and are used only to identify them.',
  },
  {
    title: 'Play money only',
    body: 'Nothing costs money, nothing can be won, and balances have no cash value. It is not gambling, and nothing here is financial or betting advice.',
  },
]

/**
 * First-visit agreement: a short summary with a link to the full Terms (in a
 * new tab) and one button. This is the only place anyone agrees. Once agreed,
 * this browser never sees it again unless TERMS_VERSION changes. It stays off
 * the Terms page itself so the full text can be read.
 */
export default function TermsGate() {
  const accepted = useLegalStore((s) => s.accepted)
  const accept = useLegalStore((s) => s.accept)
  const { pathname } = useLocation()
  const agreeRef = useRef(null)
  const open = !accepted && pathname !== '/terms'

  return (
    <Modal
      open={open}
      onClose={() => {}}
      dismissible={false}
      title="Before you start"
      description="Please read these points. They are the heart of the Terms of Use."
      initialFocusRef={agreeRef}
    >
      <ul className="space-y-3 text-sm">
        {POINTS.map((p) => (
          <li key={p.title} className="rounded-lg bg-surface-2 p-3">
            <p className="font-semibold text-fg">{p.title}</p>
            <p className="mt-1 leading-relaxed text-muted">{p.body}</p>
          </li>
        ))}
      </ul>
      <a
        href="#/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-primary-300 hover:bg-surface-2"
      >
        Read the full Terms of Use and Disclaimers
        <span aria-hidden="true">↗</span>
      </a>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        By selecting &quot;I understand and agree&quot; you confirm that you have read and understood these points and accept the Terms of Use and
        Disclaimers. You only need to do this once.
      </p>
      <button ref={agreeRef} type="button" className="btn btn-primary mt-4 w-full py-2.5" onClick={accept}>
        I understand and agree
      </button>
    </Modal>
  )
}
