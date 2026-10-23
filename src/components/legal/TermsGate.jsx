import { useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useLegalStore } from '../../store/legalStore.js'
import Modal from '../ui/Modal.jsx'

/**
 * First-visit agreement: a link to the full Terms (in a new tab) and one
 * button. This is the only place anyone agrees. Once agreed, this browser
 * never sees it again unless TERMS_VERSION changes. It stays off the Terms
 * page itself so the full text can be read.
 */
export default function TermsGate() {
  const accepted = useLegalStore((s) => s.accepted)
  const accept = useLegalStore((s) => s.accept)
  const { pathname } = useLocation()
  const agreeRef = useRef(null)
  const open = !accepted && pathname !== '/terms'

  return (
    <Modal open={open} onClose={() => {}} dismissible={false} title="Welcome to Chami Market" size="sm" initialFocusRef={agreeRef}>
      <p className="text-sm leading-relaxed text-muted">
        Please read the{' '}
        <a href="#/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-300 underline">
          Terms of Use and Disclaimers
        </a>{' '}
        before you continue. You only need to agree once.
      </p>
      <p className="mt-3 rounded-lg bg-surface-2/70 px-3 py-2.5 text-xs leading-relaxed text-muted sm:text-sm">
        <span className="font-medium text-fg">Heads up, play at your own risk.</span> Chaminade and a lot of other schools don’t allow gambling or games of
        chance, even just for fun. Everything here is play money, but it’s on you to follow your school’s rules.
      </p>
      <button ref={agreeRef} type="button" className="btn btn-primary mt-4 w-full py-2.5" onClick={accept}>
        I understand and agree
      </button>
    </Modal>
  )
}
