const RED_SUITS = new Set(['♥', '♦'])
const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' }
const RANK_NAMES = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' }
const FACES = new Set(['J', 'Q', 'K'])

const SIZES = {
  small: { box: 'h-20 w-14', corner: 'text-[13px]', pip: 'text-2xl', face: 'text-3xl' },
  normal: { box: 'h-28 w-20 sm:h-36 sm:w-[6.25rem]', corner: 'text-[15px] sm:text-lg', pip: 'text-3xl sm:text-5xl', face: 'text-4xl sm:text-6xl' },
}

/**
 * A playing card with a deal-in animation; `hidden` shows the back and flips
 * over when it turns false. A hidden card's face is left empty so the hole
 * card can't be read from the page. `delay` (ms) staggers the deal.
 */
export default function PlayingCard({ card, hidden = false, index = 0, delay, small = false, covered = false }) {
  const red = RED_SUITS.has(card?.suit)
  const s = SIZES[small ? 'small' : 'normal']
  const showFace = !hidden && card?.rank
  return (
    <div
      className={`relative ${s.box} pc-deal [perspective:900px]`}
      style={{ animationDelay: `${delay ?? index * 90}ms` }}
      role="img"
      aria-label={showFace ? `${RANK_NAMES[card.rank] ?? card.rank} of ${SUIT_NAMES[card.suit]}` : 'Face-down card'}
    >
      <div className={`card-flip absolute inset-0 ${hidden ? '[transform:rotateY(180deg)]' : ''}`}>
        <div
          className={`card-face absolute inset-0 overflow-hidden rounded-lg border border-black/15 bg-[linear-gradient(160deg,#ffffff,#f4efe6)] shadow-[0_6px_16px_-4px_rgb(0_0_0/0.6)] ${red ? 'text-[#c0262d]' : 'text-[#1c1917]'}`}
        >
          {showFace && (
            <>
              <span className={`absolute top-1 left-1.5 flex flex-col items-center leading-none font-extrabold ${s.corner}`}>
                <span className="tracking-tighter">{card.rank}</span>
                <span className="mt-0.5">{card.suit}</span>
              </span>
              <span className={`absolute right-1.5 bottom-1 flex rotate-180 flex-col items-center leading-none font-extrabold ${s.corner}`}>
                <span className="tracking-tighter">{card.rank}</span>
                <span className="mt-0.5">{card.suit}</span>
              </span>
              {/* A card tucked under the next one only shows its corner, so its middle fades out. */}
              <span className={`absolute inset-0 transition-opacity duration-300 ${covered ? 'opacity-0' : ''}`}>
              {FACES.has(card.rank) ? (
                <span className="absolute inset-[18%_16%] flex flex-col items-center justify-center rounded-md border border-current/25 bg-current/[0.06]">
                  <span className={`font-serif leading-none font-bold ${s.face}`}>{card.rank}</span>
                  <span className={small ? 'text-sm' : 'text-base sm:text-xl'}>{card.suit}</span>
                </span>
              ) : (
                <span className={`absolute inset-0 flex items-center justify-center leading-none ${card.rank === 'A' ? s.face : s.pip}`}>{card.suit}</span>
              )}
              </span>
            </>
          )}
        </div>
        <div className="card-face absolute inset-0 overflow-hidden rounded-lg border-2 border-[#f6e7c1] bg-primary-500 shadow-[0_6px_16px_-4px_rgb(0_0_0/0.6)] [transform:rotateY(180deg)]">
          <div className="absolute inset-1 rounded-md border border-[#e8b13a]/70 bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.13)_0_3px,transparent_3px_7px),repeating-linear-gradient(-45deg,rgb(0_0_0/0.18)_0_3px,transparent_3px_7px)]" />
          <div className="absolute top-1/2 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm border border-[#e8b13a]/80 bg-primary-700 sm:size-9" />
        </div>
      </div>
    </div>
  )
}
