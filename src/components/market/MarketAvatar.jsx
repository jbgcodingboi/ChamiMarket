import { useState } from 'react'
import { hashString } from '../../utils/rng.js'
import BrandMark from '../layout/BrandMark.jsx'

const GRADIENTS = [
  'from-primary-500 to-primary-800',
  'from-[#3b3f8f] to-[#1e2050]',
  'from-[#14532d] to-[#0b2b18]',
  'from-[#7c4a10] to-[#3d2408]',
  'from-[#4a1d6e] to-[#25103a]',
  'from-[#164e63] to-[#0b2832]',
]

function initials(title) {
  const words = title.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !/^(will|the|and|win|who)$/i.test(w))
  return (words[0]?.[0] ?? title[0] ?? '?').toUpperCase() + (words[1]?.[0] ?? '').toUpperCase()
}

export default function MarketAvatar({ market, size = 'size-10' }) {
  const [failed, setFailed] = useState(false)
  if (market.category === 'chaminade') return <BrandMark className={`${size} shrink-0`} rounded={16} />
  if (market.image && !failed) {
    return (
      <img
        src={market.image}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${size} shrink-0 rounded-lg bg-surface-3 object-cover`}
      />
    )
  }
  const gradient = GRADIENTS[hashString(market.id) % GRADIENTS.length]
  return (
    <span
      aria-hidden="true"
      className={`${size} grid shrink-0 place-items-center rounded-lg bg-gradient-to-br ${gradient} text-sm font-bold text-white/90`}
    >
      {initials(market.title)}
    </span>
  )
}
