# Chami Market

A paper trading prediction market. Browse live Sports and Top Politics odds, buy and sell Yes/No shares with
**play money**, and track your PnL, net worth and rank. Everything runs in the browser: there is no backend, no
real money, nothing to fund and nothing to cash out.

> **Paper trading, play money only.** Chami Market is an independent demo. It is not affiliated with, endorsed
> by or connected to Polymarket or any other prediction market or exchange. Balances have no cash value and
> nothing here is financial advice.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script            | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Vite dev server with hot reload                     |
| `npm run build`   | Production build into `dist/`                       |
| `npm run preview` | Serve the production build locally (port 4173)      |
| `npm test`        | Vitest unit tests (financial math, parsing, storage)|
| `npm run lint`    | oxlint                                              |
| `npm run check`   | lint + tests + build                                |
| `npm run snapshot`| Fetch the Polymarket, Chaminade and stock data into `public/data/` |

Requires Node 20.19+ (Node 22 recommended).

## Features

- **Discovery**: Sports, Top Politics, Chaminade and Quick, curated (see below), with Sports listed first in the All view;
  an **Ending in 24h** filter, "Closes in 2h 05m" countdowns on cards that close within a day, and a
  debounced live search (title and rules text, case-insensitive, combined with the category filter) and sorting
  by volume, newest or ending soon.
- **Market detail**: probability chart with 1D/1W/1M/All ranges, order book, rules, your position, and a sticky
  trade panel (a bottom sheet on mobile).
- **Paper trading**: instant market orders, live preview of shares, average price, payout, profit and ROI;
  partial or full sells; volume-weighted average buy price.
- **Portfolio**: net worth, available funds, unrealized and realized PnL, cost basis, open positions, win rate,
  resets used, an equity chart, a positions table and trade history with a closed/settled filter.
- **Settlement**: automatic, from the official result. When Polymarket reports a held market closed with a
  clear winner, positions pay out on the next price refresh. Trading locks as soon as an event's end date passes.
- **Reset**: back to $50,000 behind a confirmation modal that requires typing `RESET`.
- **Social**: an activity feed mixing your local trades with clearly tagged simulated trades, and three
  leaderboards of local accounts plus simulated pros: **Overall** (net worth), **Markets** (trading PnL this run:
  realized plus unrealized, leaving out games) and **Games** (net game winnings this run, with rounds, amount
  wagered, biggest win and favorite game). Markets PnL plus games net always equals the overall PnL. The selected
  board is kept in the URL (`#/leaderboard?board=games`).
- **Guest mode**: everything is browsable without an account; trading, the portfolio and resets need one.
- **Games**: Roulette, Blackjack and Plinko, played with your portfolio cash (see below).

## How the paper trading math works

All money math lives in pure functions under `src/utils/` (`trading.js`, `portfolio.js`, `math.js`) and is covered
by unit tests. Cash and PnL round to cents and shares to 4 decimals at every step through `roundMoney` and
`roundShares`, and sums are done in integer cents, so balances can't drift, go negative or become `NaN`.

| Concept         | Formula                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| Price           | Outcome price in dollars, 0 to 1. Probability = price x 100.            |
| Buy             | shares = amount / price (a $1,000 buy at $0.40 yields 2,500 shares)     |
| Average price   | total cost basis / total shares, across every buy of that outcome      |
| Sell            | proceeds = shares sold x current price                                  |
| Realized PnL    | proceeds - shares sold x average price (or payout - cost basis)         |
| Unrealized PnL  | sum of (current price - average price) x shares over open positions     |
| Net worth       | cash + sum(shares x current price)                                      |
| Settlement      | winning shares pay $1.00, losing shares pay $0.00                       |
| Reset           | cash = $50,000, positions cleared, PnL zeroed, history kept with marker |

New accounts start with exactly $100,000.00. Orders are rejected inline when the amount is zero or negative,
exceeds available cash, is below $0.01, or when the price is not strictly between 0 and 1. Sells cannot exceed
the shares you hold. Orders execute at the displayed outcome price (there is no slippage or spread model).

## Data sources and fallback

| Data                    | Source                                                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| Category tag ids        | Gamma `GET /tags/slug/{sports,politics}`, falling back to `GET /tags`     |
| League game feeds       | Gamma `GET /sports` for series ids, then `GET /events?series_id=…` for NFL, college football, MLB, NBA, NHL, the top 5 European soccer leagues and the Champions League |
| Market list and prices  | Gamma `GET /events?tag_id=…&active=true&closed=false&end_date_min=…&end_date_max=…` for the Sports (2 pages) and Politics tags |
| Held markets            | Gamma `GET /markets/{id}` (also used to detect resolved markets)          |
| Snapshot (fallback)     | `data/snapshot.json`, written by the deploy workflow every 15 minutes     |
| Chaminade games         | `data/chaminade.json`, built from the school's athletics calendar feed every 15 minutes |
| Quick markets           | Coinbase Exchange (BTC/ETH ticker and candles), api.weather.gov (forecast and Daily Climate Reports), ESPN scoreboard, all called from the browser; `data/quick.json` (SPY/QQQ closes) from the deploy job |
| Order book              | CLOB `GET /book?token_id=…`                                               |
| Price history           | CLOB `GET /prices-history?market={token}&interval=…&fidelity=…`           |

- Tag ids are discovered at startup, not hardcoded, and cached with the market list.
- Only active, open, binary markets with at least $1,000 liquidity are considered, at most 3 per event (highest
  volume first, so one game's prop markets can't flood the grid). Up to 200 Sports and 60 Politics markets are
  listed.
- `outcomes`, `outcomePrices` and `clobTokenIds` may arrive as JSON-encoded strings; numbers may arrive as strings.
  Every field is parsed and validated in `src/services/normalize.js`; anything malformed is dropped.
- Prices refresh every 30 seconds (order books every 20 seconds, on the market page). Polling stops while
  `document.visibilityState` is `hidden` and resumes when you come back.
- `src/services/http.js` adds request timeouts, in-flight de-duplication, a short response memo, a per-host
  request budget, and a cooldown after HTTP 429 (honouring `Retry-After`) to stay well inside public rate limits.
- The last good listing is cached in `localStorage` for instant startup (used if under 24 hours old).
- **Fallback 1, snapshot**: if the browser can't reach the API (timeouts, CORS, network policy, regional blocks,
  rate limits, malformed responses), the app loads `data/snapshot.json` from its own origin and the header shows
  **Delayed odds**. The deploy workflow rebuilds the site every 15 minutes with a fresh snapshot fetched server-side by
  `scripts/build-snapshot.mjs`, including the results of markets closed in the last 30 days, so held positions
  still settle.
- **Fallback 2, demo data**: with no snapshot either, the app switches to a bundled dataset (24 Sports and 12
  Politics markets with synthetic order books and price history) and shows **Offline demo data**. Season and
  election markets use real dates and drop out once they end; "this week" games roll forward so offline mode is
  never empty. Demo prices drift slightly on each poll. A demo market has no real result, so a position in one is
  voided (refunded at cost) once it ends. If live data was already loaded, it is kept and marked as
  reconnecting instead.
- When no price history is available, the chart shows a deterministic synthetic series that ends at the current
  price and is labelled as simulated. Missing order books are replaced with a labelled simulated book.

## Chaminade markets

The **Chaminade** tab has house markets on Chaminade High School (Mineola, NY) games, every level from varsity
to freshman, for the next two weeks.

- **Source**: the school's SIDEARM athletics calendar feed
  (`https://athletics.chaminade-hs.org/services/responsive-calendar.ashx?type=month&sport=0&location=all&date=M/1/YYYY`),
  which lists each game's team, opponent, home/away, status (upcoming, over, postponed, canceled) and final score.
  The feed doesn't allow browser requests (no CORS), so `scripts/build-snapshot.mjs` fetches it in the deploy
  workflow and ships `data/chaminade.json` with the site. Multi-team meets, invitationals and regattas are
  skipped because there's no single opponent.
- **Markets**: "Will Chaminade beat …?" for every head-to-head game, plus an over/under on the total score for
  football, soccer, basketball, hockey, lacrosse and baseball once a team has 3 scored games.
- **Odds** are set by Chami Market (`src/services/chaminade.js`), since no betting market exists. The model takes
  this season's average margin for that team (shrunk toward even when there are few games), blends in any
  earlier meeting with the same opponent, adds home field, and converts to a win probability using the typical
  margin spread for the sport (ties count as a loss in soccer and hockey). Win odds are clamped to 15%–85%, so
  there are no long shots or near-locks. Over/under lines sit at the season's average total, so they open
  close to 50/50.
- **Settlement**: trading closes at the scheduled start. The workflow runs every 15 minutes and settles markets
  as soon as the school posts the final score: winner markets on W/L/T, over/unders on the combined score.
  Canceled or postponed games, and games with no posted result after 3 days, are voided (refunded at cost).
  Over/under ids carry their line, so a market always settles against the line it was traded at.

## Quick markets

The **Quick** tab is for trades that settle in minutes or hours. All of these are house-priced (no betting market
exists for them), labelled "House odds", and settle automatically from public data. Market ids describe the market
completely (coin and window, station and date, stock and session, parlay legs), so any browser can price and settle
them without shared state. Code: `src/services/quick/`.

| Market | Odds | Trading closes | Settles from | Typical wait |
| --- | --- | --- | --- | --- |
| Bitcoin / Ethereum up or down, next two 15-minute windows | 50% | Window start | Coinbase 1-minute candles (browser) | ~1 min after the window |
| Bitcoin / Ethereum above $K at the top of the hour (two strikes around the hour's open) | Live: digital option N(d2) from spot and the last hour's volatility | 15 min before the hour | Coinbase 1-minute candles (browser) | ~1 min after the hour |
| Central Park / Islip (Long Island) "hits X°F" today and tomorrow, on round 5°F lines near the forecast, only when 12%–88% | NWS forecast high with ~2.5°F (today) / 3.5°F (tomorrow) error | 11:00 AM ET that day | NWS Daily Climate Report: a Yes from the 4 PM report, otherwise the overnight final | Same afternoon or overnight |
| Central Park / Islip "rain or snow" (≥ 0.01 in), only when 15%–85% | NWS chance of precipitation | 7:00 AM ET that day | NWS Daily Climate Report | Same afternoon or overnight |
| S&P 500 (SPY) and Nasdaq-100 (QQQ) "up on <day>?" for the next NYSE session | 53% (long-run share of up days) | 9:30 AM ET open | Official closes, fetched every 15 minutes by the deploy job (Yahoo Finance; no browser access) | ~15–30 min after the close |
| Daily parlays: 2–3 favorites (55%–85% each) from games starting in the next 24 hours, never below 15% combined | Product of the legs' live prices | First leg's start | The legs: any loss settles No at once, all wins settle Yes, a void voids it | As soon as the legs settle |

**Faster game results**: tonight's NFL, college football, NBA, MLB and NHL moneyline markets (two team-name
outcomes) settle from ESPN's public scoreboard as soon as a game is final, instead of waiting hours for
Polymarket's resolution. Only markets whose outcomes match both teams of one ESPN game are settled this way.

## Games

The **Games** tab (between Markets and Leaderboard) has three casino games that bet with your portfolio cash, the
same $100,000 you trade with. Wins and losses change your net worth, the equity chart and your leaderboard rank
like any trade, and a balance reset covers games too. Playing needs an account, just like trading. Every round is
logged on the portfolio's **Games** tab, with per-game stats (rounds, amount wagered, net) and a "Games this run"
total on the dashboard. Realized PnL still counts market sells and settlements only. All randomness comes from the Web Crypto API with rejection
sampling, so outcomes are unbiased.

- **Roulette**: European single-zero wheel (37 pockets) with an animated SVG wheel and ball. Straight up pays
  35:1, split 17:1, street 11:1, corner 8:1, six line 5:1, dozens and columns 2:1, and red/black, odd/even and
  1-18/19-36 pay 1:1. Click a cell edge or corner for splits, streets, corners and six lines. Undo, clear, double
  and rebet are built in. On phones the table turns upright so it fits without scrolling.
- **Blackjack**: six-deck shoe reshuffled with about a quarter left. Blackjack pays 3:2, wins 1:1, insurance
  2:1. The dealer peeks under an ace or ten and stands on all 17s, soft 17 included. Double on any first two
  cards, split pairs up to four hands (split aces get one card each). A hand in progress survives a reload.
- **Plinko**: a canvas board with gravity and a bounce off a pin on every row. Choose 8, 12 or 16 rows, low,
  medium or high risk, and 1 to 25 balls at a time. Each ball goes left or right with equal chance at each row,
  so buckets follow a binomial distribution; every row and risk setting returns about 99% over the long run.

The engines are pure functions in `src/games/` (with tests). A round's stake is taken when it starts and the
payout is credited when the animation ends; if you leave the page mid-spin or mid-drop, the payout is credited
anyway, and a round started before a balance reset is dropped. Game records are stored on the portfolio itself.

## Curation rules

All of these live in `src/utils/curation.js` (with tests) and apply to live data, the snapshot and demo data alike.

- **Dates**: markets whose end date has passed are hidden, as are markets ending after June 1, 2027.
- **Odds**: markets priced below 6% or above 95% are hidden, except ceasefire, alien and political-agreement
  markets and championship-style futures ("Will … win the 2027 Championship?"), which are listed at any price.
- **Sports**: every sport is kept (NFL, MLB, NBA, NHL, college, tennis, UFC, golf, F1 and so on) except esports,
  which are hidden. Soccer is limited to the Premier League, La Liga, Serie A, Bundesliga, Ligue 1, the
  Champions League and the Ballon d'Or; MLS, other domestic leagues, cups, women's and youth competitions,
  international qualifiers and other trophies are hidden.
- **Politics**: tweet-count, mention, "will X say" and meme markets (including Elon Musk markets) are hidden, as
  are foreign elections and domestic politics most Americans don't follow (Brazil, Japan, Poland and so on).
  Israel, Iran, Russia and Ukraine, China and Taiwan, North Korea, NATO, the UK, Canada, Mexico, Venezuela, the
  Pope and the wider Middle East are kept, as is anything that also involves the US.

A held market that later falls outside these rules stays in your portfolio and still settles normally.

## Accounts and storage

Sign up and log in use a username or email plus a password. Accounts, sessions, portfolios, trade history,
equity snapshots, resolutions, the cached market list and the shared activity feed live in `localStorage` under
`redbook:*` keys, with a schema version and migration hook. Every read is validated; corrupted values are
discarded (falling back to defaults) and storage falls back to memory in private mode. History, snapshots, the
feed and cached markets are all capped. Several accounts can share a browser with fully separate portfolios, and
other tabs stay in sync through `storage` events.

> **Demo-grade auth.** Passwords are salted and hashed with PBKDF2-SHA-256 (600,000 iterations, per OWASP; older
> hashes are upgraded on the next login) via the Web Crypto API and plaintext
> is never stored, but a client-side account system is not secure: anyone with access to the browser can read or
> edit the data. Don't reuse a real password. Web Crypto needs HTTPS or `localhost`.

When a market resolves (from the live API or the snapshot), the active account is settled on the next price
refresh. Other local accounts are settled automatically the next time they log in. Once an event's end date
passes, buying and selling stop until the result is in.

## Security

There is no backend, no secret and no API key; every upstream API is public. Hardening in place:

- **Content-Security-Policy**: `security.config.js` holds the policy. The build adds it as a `<meta>` tag (the
  only option on GitHub Pages), and `vercel.json` and `netlify.toml` send it as a header together with
  `frame-ancestors 'none'`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
  and `Cross-Origin-Opener-Policy`. Scripts and styles are same-origin only, `connect-src` lists the five APIs the
  browser calls, and a test fails if the app fetches from a host the policy doesn't list or the host configs drift.
  The dev server runs without the policy because hot reload needs inline scripts.
- **Untrusted data**: market ids from the API, the snapshot, a URL or `localStorage` are checked before use as
  dictionary keys (`__proto__`, `constructor` and `prototype` are rejected) and looked up as own properties only.
  Stored markets are re-validated on load, including that images are `https` URLs. Nothing renders HTML from data.
- **CI**: GitHub Actions are pinned to commit SHAs, the workflow has no default permissions (only the deploy job
  gets `pages` and `id-token`), installs run with `--ignore-scripts`, and `npm audit` gates the build. Dependabot
  (`.github/dependabot.yml`) opens weekly updates for npm packages and actions. Scheduled runs only rebuild the
  latest reviewed commit on `main` with fresh data.

What can't be fixed client-side: anyone with access to the browser can read or edit `localStorage`, including
balances and the session. That's acceptable for a single-browser play-money demo, but a shared leaderboard or
anything with real stakes would need a server.

## Deploy

The build is a static SPA in `dist/`. It uses hash-based routing (`/#/market/123`), so deep links never 404 and no
server configuration is strictly required. Rewrite rules are still included for hosts that use them.

- **Vercel**: import the repository. `vercel.json` sets the build command, the `dist` output and an SPA rewrite.
- **Netlify**: import the repository. `netlify.toml` sets `npm run build` and `dist`; `public/_redirects` adds the
  SPA fallback.
- **GitHub Pages**: in the repository settings set Pages to deploy from **GitHub Actions**, then push to `main`.
  `.github/workflows/deploy-pages.yml` tests, builds and publishes. Asset paths are relative (`base: './'`), so
  project sites at `/<repo>/` work out of the box. Set `BASE_PATH=/<repo>/` at build time if you prefer absolute
  paths.

## Project structure

```
src/
  components/   UI (layout, market, portfolio, social, ui primitives, modals)
  pages/        Route-level pages, lazy loaded
  services/     Gamma and CLOB clients, parsing, mock data, synthetic generators, simulated traders
  games/        Roulette, Blackjack and Plinko engines, physics and RNG (with Vitest tests)
  store/        Zustand stores: markets, accounts and portfolios, resolutions, feed, games, toasts, UI
  utils/        Pure financial math, formatters, storage, validation, hashing, safe keys (with Vitest tests)
  hooks/        Polling, debounce, price flash, portfolio metrics, leaderboard
```

## Assumptions

- Gamma and CLOB endpoints answer browser requests with permissive CORS headers. If a host blocks them, the app
  runs on demo data.
- `outcomePrices[0]` is the Yes (first outcome) price and `clobTokenIds[0]` its CLOB token. Two-outcome markets with
  other labels (for example two team names) are shown with those labels.
- Gamma `/events` honours `tag_id`, `series_id`, `active`, `closed`, `order=volume24hr` and the
  `end_date_min`/`end_date_max` filters (if the date filters are rejected the request is retried without them;
  curation still applies client-side). Events carry `tags`, used to classify soccer leagues.
- Gamma `/sports` returns `{ sport, series, tags }` rows with league codes such as `nfl`, `mlb`, `epl`, `lal`,
  `sea`, `bun`, `fl1` and `ucl`. Unknown codes are simply skipped; their games still arrive via the Sports tag.
- A closed market is treated as resolved only when one outcome is priced at 0.99 or higher and the other at
  0.01 or lower.

## Known limitations

- Market orders fill entirely at the displayed price; there is no order book matching, slippage or fees.
- The activity feed only shows real trades made in this browser, alongside simulated ones.
- Leaderboard pro traders are simulated portfolios, tagged as such.
- Markets that drop out of the live listing keep their last known price unless you hold them (held markets are
  refreshed individually).
- Polymarket markets that resolve 50/50 (no clear winner) are not settled automatically.
- The keyword lists behind the curation rules can't catch everything; they are easy to extend in
  `src/utils/curation.js`.
