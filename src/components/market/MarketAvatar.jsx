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

const glyph = (d) => (
  <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)

const QUICK_GLYPHS = {
  btc: { bg: 'bg-[#c27515]', glyph: <span className="text-lg font-bold">₿</span> },
  eth: { bg: 'bg-[#4b5bb5]', glyph: <span className="text-lg font-bold">Ξ</span> },
  weather: { bg: 'bg-[#1f6f9a]', glyph: glyph(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>) },
  rain: { bg: 'bg-[#2c5d8a]', glyph: glyph(<><path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.6 1.5A3.5 3.5 0 0 1 17 15H7Z" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></>) },
  stocks: { bg: 'bg-[#1d7a4d]', glyph: glyph(<path d="M3 17l6-6 4 4 8-8M15 7h6v6" />) },
  parlay: { bg: 'bg-primary-500', glyph: glyph(<><rect x="4" y="4" width="10" height="10" rx="2" /><rect x="10" y="10" width="10" height="10" rx="2" /></>) },
}

function initials(title) {
  const words = title.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !/^(will|the|and|win|who)$/i.test(w))
  return (words[0]?.[0] ?? title[0] ?? '?').toUpperCase() + (words[1]?.[0] ?? '').toUpperCase()
}

export default function MarketAvatar({ market, size = 'size-10' }) {
  const [failed, setFailed] = useState(false)
  if (market.category === 'chaminade') return <BrandMark className={`${size} shrink-0`} rounded={16} />
  if (market.avatar && QUICK_GLYPHS[market.avatar]) {
    const { bg, glyph } = QUICK_GLYPHS[market.avatar]
    return (
      <span aria-hidden="true" className={`${size} grid shrink-0 place-items-center rounded-lg ${bg} text-white`}>
        {glyph}
      </span>
    )
  }
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
