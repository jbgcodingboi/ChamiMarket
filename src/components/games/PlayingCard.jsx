const RED_SUITS = new Set(['♥', '♦'])

/** A playing card with a deal-in animation; `hidden` shows the back (flips when revealed). */
export default function PlayingCard({ card, hidden = false, index = 0, small = false }) {
  const red = RED_SUITS.has(card?.suit)
  const size = small ? 'h-20 w-14 text-sm' : 'h-28 w-20 text-base'
  return (
    <div
      className={`relative ${size} animate-card-deal [perspective:800px]`}
      style={{ animationDelay: `${index * 90}ms` }}
      role="img"
      aria-label={hidden || !card ? 'Face-down card' : `${card.rank} of ${{ '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }[card.suit]}`}
    >
      <div className={`card-flip absolute inset-0 ${hidden ? '[transform:rotateY(180deg)]' : ''}`}>
        <div className={`card-face absolute inset-0 flex flex-col justify-between rounded-lg border border-black/10 bg-[#fdfbf7] p-1.5 shadow-lg shadow-black/40 ${red ? 'text-[#c0262d]' : 'text-[#1c1917]'}`}>
          <span className="leading-none font-bold">
            {card?.rank}
            <br />
            {card?.suit}
          </span>
          <span className={`self-center ${small ? 'text-2xl' : 'text-3xl'}`}>{card?.suit}</span>
          <span className="rotate-180 leading-none font-bold">
            {card?.rank}
            <br />
            {card?.suit}
          </span>
        </div>
        <div className="card-face absolute inset-0 rounded-lg border-2 border-white/80 bg-primary-500 shadow-lg shadow-black/40 [transform:rotateY(180deg)]">
          <div className="absolute inset-1.5 rounded-md border border-white/40 bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.12)_0_4px,transparent_4px_8px)]" />
        </div>
      </div>
    </div>
  )
}
