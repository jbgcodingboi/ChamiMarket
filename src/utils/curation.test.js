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
  it('moves the cutoff about seven months out once June 2027 gets close', () => {
    const later = Date.parse('2027-03-01T12:00:00Z')
    expect(exclusionReason(base({ endDate: '2027-08-01T00:00:00Z' }), later)).toBeNull()
    expect(exclusionReason(base({ endDate: '2027-10-15T00:00:00Z' }), later)).toBe('ends-after-cutoff')
  })
  it('hides ordinary markets below 6% or above 95%', () => {
    expect(reason({ title: 'Chiefs vs. Bills', yesPrice: 0.97 })).toBe('lopsided-odds')
    expect(reason({ title: 'Will the Jets go 17-0?', yesPrice: 0.01 })).toBe('lopsided-odds')
    expect(reason({ title: 'Will Democrats win the House?', category: 'politics', yesPrice: 0.99 })).toBe('lopsided-odds')
    expect(reason({ title: 'Chiefs vs. Bills', yesPrice: 0.06 })).toBeNull()
    expect(reason({ title: 'Chiefs vs. Bills', yesPrice: 0.95 })).toBeNull()
  })
  it('lists ceasefire, alien, agreement and championship markets at any price', () => {
    const cases = [
      { title: 'Russia x Ukraine ceasefire by March 31?', category: 'politics' },
      { title: 'Will the US confirm that aliens exist in 2026?', category: 'politics' },
      { title: 'US x China trade deal by December 31?', category: 'politics' },
      { title: 'Israel and Saudi Arabia normalize relations?', category: 'politics' },
      { title: 'Will the Chiefs win Super Bowl LXI?' },
      { title: 'Will Ohio State win the 2027 CFP National Championship?' },
      { title: 'Will Arsenal win the Premier League?' },
    ]
    for (const c of cases) {
      for (const yesPrice of [0.01, 0.03, 0.5, 0.97, 0.99]) {
        expect(reason({ ...c, yesPrice }), `${c.title} @ ${yesPrice}`).toBeNull()
      }
    }
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

describe('esports', () => {
  it('removes esports', () => {
    expect(reason({ title: 'LoL: T1 vs. Gen.G (BO5)' })).toBe('esports')
    expect(reason({ title: 'Counter-Strike: Vitality vs. NAVI' })).toBe('esports')
    expect(reason({ title: 'Will Team Spirit win The International (Dota 2)?' })).toBe('esports')
    expect(reason({ title: 'Sentinels vs. Fnatic', tags: ['esports', 'valorant'] })).toBe('esports')
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
    const list = [
      base({ id: 'a' }),
      base({ id: 'b', title: 'Will the Jets go 17-0?', yesPrice: 0.01 }),
      base({ id: 'c', endDate: '2026-01-01T00:00:00Z' }),
    ]
    expect(curate(list, NOW).map((m) => m.id)).toEqual(['a'])
  })
  it('leaves out death, war, crime and other topics that do not belong on a student site', () => {
    for (const title of ['Will Putin die in 2026?', 'US airstrike on Iran by June?', 'Will Diddy be convicted?', 'Russia x Ukraine war ends in 2026?', 'Will X be arrested?'])
      expect(reason({ title })).toBe('sensitive')
    for (const title of ['Will the Warriors win the NBA Finals?', 'Chargers vs. Raiders', 'Will Taylor Swift release a new album?'])
      expect(reason({ title })).not.toBe('sensitive')
  })
})
