import { useState } from 'react'
import { useResolution } from '../../store/resolutionStore.js'
import { formatCents } from '../../utils/format.js'
import Modal from '../ui/Modal.jsx'
import TradePanel from './TradePanel.jsx'

/** Mobile: a fixed bar that opens the trade panel as a bottom sheet. */
export default function MobileTradeBar({ market, side, onSideChange }) {
  const [open, setOpen] = useState(false)
  const resolution = useResolution(market.id)
  if (resolution || market.closed || market.acceptingOrders === false) return null

  const openWith = (s) => {
    onSideChange(s)
    setOpen(true)
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-2 gap-2">
          <button type="button" className="btn bg-yes py-3 text-white hover:bg-yes-strong" onClick={() => openWith('yes')}>
            Buy {market.labels.yes} {formatCents(market.yesPrice)}
          </button>
          <button type="button" className="btn bg-no py-3 text-white hover:bg-no-strong" onClick={() => openWith('no')}>
            Buy {market.labels.no} {formatCents(market.noPrice)}
          </button>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Trade" description={market.title} variant="sheet">
        <TradePanel market={market} side={side} onSideChange={onSideChange} onDone={() => setOpen(false)} />
      </Modal>
    </>
  )
}
