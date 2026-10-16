import { describe, expect, it } from 'vitest'
import { curate, exclusionReason, hasEnded } from './curation.js'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const base = (over = {}) => ({
  id: 'x',
  title: 'Will the Chiefs make the playoffs?',
  eventTitle: '',
  description: '',
  category: 'sports',
  yesPrice: 0.5,
  endDate: '2027-01-10T00:00:00Z',
  tags: [],
  league: null,
  ...over,
})
const reason = (over) => exclusionReason(base(over), NOW)

describe('dates and odds', () => {
  it('hides markets whose end date has passed', () => {
    expect(reason({ endDate: '2026-10-15T23:00:00Z' })).toBe('ended')
    expect(hasEnded(base({ endDate: '2026-10-15T23:00:00Z' }), NOW)).toBe(true)
    expect(reason({ endDate: null })).toBe('no-end-date')
  })
  it('hides markets ending after June 1, 2027', () => {
    expect(reason({ endDate: '2027-06-01T23:59:00Z' })).toBeNull()
    expect(reason({ endDate: '2027-06-02T00:00:00Z' })).toBe('ends-after-cutoff')
    expect(reason({ endDate: '2027-06-20T00:00:00Z' })).toBe('ends-after-cutoff')
  })
  it('keeps odds between 6% and 95% only', () => {
    expect(reason({ yesPrice: 0.06 })).toBeNull()
    expect(reason({ yesPrice: 0.95 })).toBeNull()
    expect(reason({ yesPrice: 0.059 })).toBe('lopsided-odds')
    expect(reason({ yesPrice: 0.951 })).toBe('lopsided-odds')
  })
})

describe('sports', () => {
  it('keeps US sports and other non-soccer sports', () => {
    for (const title of ['Chiefs vs. Bills', 'Will the Yankees win Game 3?', 'Lakers vs. Celtics', 'Sinner vs. Alcaraz', 'UFC 320: Jones vs. Aspinall', 'Indian Premier League: Mumbai vs. Chennai', 'Will India win the Cricket World Cup?']) {
      expect(reason({ title })).toBeNull()
    }
  })
  it('keeps top European leagues, the Champions League and the Ballon d\'Or', () => {
    expect(reason({ title: 'Arsenal vs. Chelsea', league: 'epl' })).toBeNull()
    expect(reason({ title: 'Real Madrid vs. Barcelona', tags: ['soccer', 'la-liga'] })).toBeNull()
    expect(reason({ title: 'Will Inter win Serie A?', tags: ['soccer'] })).toBeNull()
    expect(reason({ title: 'Will Bayern win the Bundesliga?' })).toBeNull()
    expect(reason({ title: 'Will PSG win Ligue 1?' })).toBeNull()
    expect(reason({ title: 'Champions League winner: Liverpool?' })).toBeNull()
    expect(reason({ title: "Will Yamal win the Ballon d'Or?" })).toBeNull()
  })
  it('removes minor soccer leagues and trophies', () => {
    expect(reason({ title: 'Inter Miami vs. LA Galaxy', tags: ['soccer', 'mls'] })).toBe('minor-soccer')
    expect(reason({ title: 'Flamengo vs. Palmeiras', tags: ['soccer'] })).toBe('minor-soccer')
    expect(reason({ title: 'Will Fulham win the FA Cup?' })).toBe('minor-soccer')
    expect(reason({ title: 'Europa League winner: Roma?' })).toBe('minor-soccer')
    expect(reason({ title: 'Brasileirão Série A: Santos vs. Grêmio' })).toBe('minor-soccer')
    expect(reason({ title: "Women's Champions League: Lyon vs. Barcelona" })).toBe('minor-soccer')
    expect(reason({ title: '2. Bundesliga: Hamburg vs. Schalke' })).toBe('minor-soccer')
    expect(reason({ title: 'Will Italy qualify for the FIFA World Cup?' })).toBe('minor-soccer')
  })
})

describe('politics', () => {
  const pol = (title) => reason({ title, category: 'politics' })
  it('keeps US politics, Israel and major international stories', () => {
    for (const title of [
      'Will Democrats win the House in 2026?',
      'Georgia Senate race: will the Democrat win?',
      'Will Netanyahu remain Prime Minister through 2026?',
      'Israel and Saudi Arabia normalize relations by March 31?',
      'Russia x Ukraine ceasefire by March 31, 2027?',
      'Will China invade Taiwan before 2027?',
      'Next UK Prime Minister: will Starmer be out by 2027?',
      'Will Trump impose 50% tariffs on Brazil?',
    ]) {
      expect(pol(title), title).toBeNull()
    }
  })
  it('removes tweet, mention and meme markets', () => {
    expect(pol('Elon Musk # of tweets October 17-24?')).toBe('junk-politics')
    expect(pol('Will Trump say "tariff" 20+ times during the speech?')).toBe('junk-politics')
    expect(pol('How many Truth Social posts will Trump make this week?')).toBe('junk-politics')
  })
  it('removes foreign politics with little US relevance', () => {
    expect(pol('Brazil presidential election: will Lula win?')).toBe('low-relevance-international')
    expect(pol('Next Prime Minister of Japan')).toBe('low-relevance-international')
    expect(pol('Polish presidential election winner')).toBe('low-relevance-international')
    expect(pol('Will the AfD win the most seats in Germany?')).toBe('low-relevance-international')
  })
})

describe('curate', () => {
  it('filters a list down to listable markets', () => {
    const list = [base({ id: 'a' }), base({ id: 'b', yesPrice: 0.99 }), base({ id: 'c', endDate: '2026-01-01T00:00:00Z' })]
    expect(curate(list, NOW).map((m) => m.id)).toEqual(['a'])
  })
})
