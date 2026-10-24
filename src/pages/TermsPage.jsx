import { Link } from 'react-router-dom'
import { TERMS_EFFECTIVE } from '../config.js'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'

/** Sections of the Terms. Each body is a list of paragraphs. */
const SECTIONS = [
  {
    id: 'about',
    title: 'What Chami Market is',
    body: [
      'Chami Market ("the site", "we", "us") is a free, unofficial fan project. It lets you practice forecasting with play money: you trade simulated shares in the outcome of public events and play casino style games, all with a pretend balance.',
      'By using the site you agree to these Terms of Use. If you do not agree, do not use the site.',
    ],
  },
  {
    id: 'affiliation',
    title: 'No affiliation or endorsement',
    body: [
      'Chami Market is NOT affiliated with, endorsed by, sponsored by, approved by, or associated with Chaminade High School, its administration, faculty, staff, students, parents, alumni, athletic programs, or the Society of Mary (Marianists). It is not an official Chaminade site, club, or activity, and nothing on it speaks for Chaminade.',
      'The same is true for every other organization named or used on the site, including Polymarket, ESPN, the National Weather Service and NOAA, Coinbase, Yahoo Finance, Supabase, GitHub, any school, team, league, conference, athlete, candidate, party, or company. None of them has reviewed, approved, or sponsored this site.',
      'Names, team names, and other marks belong to their owners. They appear only to describe the real world events a market is about. Their use does not suggest any connection or endorsement.',
      'Markets about school teams cover team results only. We do not create markets about individual students.',
    ],
  },
  {
    id: 'play-money',
    title: 'Play money only, no gambling',
    body: [
      'Every balance, trade, game, and payout on the site uses play money with no cash value. You cannot deposit money, buy play money, win prizes, or cash out, and play money cannot be sold, traded, or exchanged for anything of value. Because nothing of value can be paid in or won, the site is not gambling, a lottery, or a real prediction market, exchange, or brokerage.',
      'Some players and feed entries tagged SIM are simulated to keep the site lively while it is new. They are not real people.',
    ],
  },
  {
    id: 'own-risk',
    title: 'Play at your own risk',
    body: [
      'You use the site, including its casino style games, at your own risk. Chaminade High School and many other schools and institutions don’t allow gambling or games of chance, and those rules can apply on their grounds, devices, and networks even when no real money is involved.',
      'Everything here is play money with no cash value, but the games still look and work like games of chance. It is your responsibility to know and follow the rules of your school, workplace, and anywhere else you use the site. We are not responsible for any discipline or other consequences that come from using it.',
    ],
  },
  {
    id: 'advice',
    title: 'Not advice, and no promise of accuracy',
    body: [
      'Nothing on the site is financial, investment, betting, legal, or other professional advice. Prices, odds, scores, weather, and other data come from third party sources or our own estimates and may be wrong, late, or missing. Games and markets may contain mistakes. Do not rely on the site for any real world decision.',
      'Learning about odds is fine. Don’t use anything on this site to place real bets, and don’t bet real money or anything of value with other players on leaderboard ranks, markets, or game results. Real money gambling is illegal for minors. If gambling is ever a problem for you or someone you know, call or text 1-800-GAMBLER.',
    ],
  },
  {
    id: 'eligibility',
    title: 'Who may use the site',
    body: [
      'You must be at least 13 years old. If you are under 18, you may use the site only with permission from a parent or legal guardian, who agrees to these Terms for you. Follow your school’s rules about when and where you use websites.',
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts',
    body: [
      'Keep your password and recovery code private. You are responsible for activity on your account. Do not share accounts, create accounts to cheat, or use someone else’s account.',
      'Your username is public. Do not use your full real name, another person’s name, or anything offensive, hateful, sexual, threatening, or misleading. We may rename, suspend, or delete any account at any time, with or without notice.',
    ],
  },
  {
    id: 'conduct',
    title: 'Acceptable use',
    body: [
      'Do not harass, bully, threaten, impersonate, or target anyone, including other students or school staff. Do not try to hack, overload, scrape, or reverse engineer the site, exploit bugs to inflate a balance, use bots or scripts, or get around rate limits or security. If you find a bug, please report it instead of using it.',
      'We may reset balances, reverse trades or game results, remove leaderboard entries, and fix mistakes whenever we think it is needed to keep the site fair.',
    ],
  },
  {
    id: 'privacy',
    title: 'Your information',
    body: [
      'We store only what the site needs to work: your username (or email, if you sign up with one), a securely hashed password, your recovery code in hashed form, your play money activity, and any messages you send through the Feedback tab. Passwords are never stored in readable form. Your username, balance, trades, and game results can be seen by other players on leaderboards and feeds.',
      'The site is hosted on GitHub Pages, and accounts stored on our server are hosted with Supabase, so those services process this data for us and automatically log technical data, such as IP addresses, to run and protect their services. Your browser also stores some settings and data locally. We do not sell your information or show ads. Do not enter sensitive personal information anywhere on the site. If you play as a guest, your play money activity is kept under an anonymous guest account until you sign up or it goes unused for 30 days.',
      'You can delete your account at any time from the account menu. That permanently erases the account, its balance, trades, game history, and leaderboard entries. For anything else about your data, contact us as described below.',
    ],
  },
  {
    id: 'third-party',
    title: 'Third party services and links',
    body: [
      'The site uses data and services from third parties and may link to other websites. We do not control them and are not responsible for their content, accuracy, availability, or practices. Their own terms and privacy policies apply.',
    ],
  },
  {
    id: 'content',
    title: 'Ownership and takedown requests',
    body: [
      'The site’s own design and code belong to its creator. Third party names, data, and marks belong to their owners.',
      'If you represent an organization named on the site, or believe anything here infringes your rights, is inaccurate, or should come down, contact us and we will review it promptly and remove it where appropriate.',
    ],
  },
  {
    id: 'warranty',
    title: 'Provided as is',
    body: [
      'THE SITE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING ANY WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, OR NON INFRINGEMENT. WE DO NOT PROMISE THAT THE SITE WILL BE AVAILABLE, SECURE, OR FREE OF ERRORS, OR THAT ANY DATA OR BALANCE WILL BE KEPT.',
    ],
  },
  {
    id: 'liability',
    title: 'Limits on liability',
    body: [
      'TO THE FULLEST EXTENT ALLOWED BY LAW, THE CREATOR AND ANYONE HELPING RUN THE SITE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA, PLAY MONEY, OR OPPORTUNITY, ARISING FROM YOUR USE OF THE SITE OR YOUR INABILITY TO USE IT. OUR TOTAL LIABILITY FOR ANY CLAIM ABOUT THE SITE IS LIMITED TO ZERO DOLLARS ($0), BECAUSE THE SITE IS FREE AND PLAY MONEY HAS NO VALUE.',
      'Some places do not allow certain limits, so some of these may not apply to you.',
    ],
  },
  {
    id: 'indemnity',
    title: 'Your responsibility',
    body: [
      'You agree to be responsible for, and to defend and hold harmless the creator from, any claim, loss, or cost that comes from your misuse of the site or your breaking these Terms.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes and ending use',
    body: [
      'We may change, pause, reset, or shut down the site, or any part of it, at any time without notice. We may update these Terms. When we do, the date below changes and you will be asked to agree again. Using the site after a change means you accept the new Terms.',
      'You may stop using the site at any time. We may end your access at any time if you break these Terms or for any other reason.',
    ],
  },
  {
    id: 'law',
    title: 'Governing law',
    body: [
      'These Terms are governed by the laws of the State of New York, without regard to conflict of law rules. Any dispute will be handled in the state or federal courts located in New York, unless the law where you live requires otherwise.',
    ],
  },
  {
    id: 'general',
    title: 'General',
    body: [
      'These Terms are the whole agreement between you and us about the site. If any part is found unenforceable, the rest still applies. Our not enforcing a part is not a waiver of it. You may not transfer your rights under these Terms. We may transfer ours.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: ['For questions, corrections, or takedown requests, use the Feedback tab on the side of the page. Messages go privately to the site owner.'],
  },
]

// The app uses hash routing, so in-page anchors scroll instead of changing the URL.
const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

export default function TermsPage() {
  useDocumentTitle('Terms of Use')

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Terms of Use and Disclaimers</h1>
      <p className="mt-1 text-sm text-muted">Effective {TERMS_EFFECTIVE}</p>

      <div className="card mt-5 border-warn/40 p-4 text-sm leading-relaxed">
        <p className="font-semibold text-fg">The short version</p>
        <p className="mt-1 text-muted">
          Chami Market is an unofficial fan site. It is not affiliated with, endorsed by, or associated with Chaminade High School or any other organization
          named on it. Everything uses play money with no cash value. Nothing here is advice, and the site is provided as is. Play at your own risk:
          Chaminade High School and many other schools don’t allow gambling or games of chance, so follow their rules.
        </p>
      </div>

      <nav aria-label="Sections" className="mt-5 flex flex-wrap gap-1.5 text-xs">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" onClick={() => jump(s.id)} className="rounded-full bg-surface-2 px-2.5 py-1 text-muted hover:text-fg">
            {s.title}
          </button>
        ))}
      </nav>

      <ol className="mt-6 space-y-6">
        {SECTIONS.map((s, i) => (
          <li key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-lg font-semibold">
              {i + 1}. {s.title}
            </h2>
            {s.body.map((para) => (
              <p key={para.slice(0, 40)} className="mt-2 text-sm leading-relaxed text-muted">
                {para}
              </p>
            ))}
          </li>
        ))}
      </ol>

      <p className="mt-10 text-sm">
        <Link to="/" className="text-primary-300 hover:underline">
          Back to markets
        </Link>
      </p>
    </div>
  )
}
