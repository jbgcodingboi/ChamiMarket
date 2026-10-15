import { getMarket } from '../../store/marketStore.js'
import SellForm from '../market/SellForm.jsx'
import Modal from '../ui/Modal.jsx'

/** Sell / cash out dialog for one position, at the current market price. */
export default function SellModal({ position, onClose }) {
  const market = position ? getMarket(position.marketId) : null
  return (
    <Modal
      open={Boolean(position)}
      onClose={onClose}
      title="Sell / Cash out"
      description={position ? `${position.marketTitle} · ${market?.labels[position.side] ?? position.side}` : ''}
    >
      {position && <SellForm market={market} position={position} defaultPercent={100} onDone={onClose} />}
    </Modal>
  )
}
