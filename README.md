# Chami Market

A paper trading prediction market. Browse live Sports and Top Politics odds, buy and sell Yes/No shares with
**play money**, and track your PnL, net worth and rank. It runs fully in the browser out of the box, or with an
optional Supabase backend for real accounts, a shared leaderboard and a live feed (see
[Backend](#backend-supabase)). There is never any real money, nothing to fund and nothing to cash out.

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
| `npm run test:db` | Database tests for `supabase/schema.sql` on a throwaway local Postgres 16+ |
| `npm run sync`    | Push prices and results to the Supabase backend by hand (needs the service key) |

Requires Node 20.19+ (Node 22 recommended).

## Features

- **Discovery**: Sports, Top Politics, Chaminade and Quick, curated (see below), with Sports listed first in the All view.
  On the Sports tab a second row narrows to a sport or league (NFL, NBA, MLB, NHL, college, each top soccer league,
  tennis, golf, UFC/MMA and more), showing only the ones with markets and how many each has;
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
- **Games**: Roulette, Blackjack, Plinko, Dice, Mines, Chicken Cross, Limbo (with Crash) and the Golden Sevens slot,
  played with your portfolio cash (see below).

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
  **Market odds**. The deploy workflow rebuilds the site every 15 minutes with a fresh snapshot fetched server-side by
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
completely (coin and window, station and date, stock and session), so any browser can price and settle them
without shared state. Code: `src/services/quick/`.

| Market | Odds | Trading closes | Settles from | Typical wait |
| --- | --- | --- | --- | --- |
| Bitcoin / Ethereum up or down, next two 15-minute windows | 50% | Window start | Coinbase 1-minute candles (browser) | ~1 min after the window |
| Bitcoin / Ethereum above $K at the top of the hour (two strikes around the hour's open) | Live: digital option N(d2) from spot and the last hour's volatility | 15 min before the hour | Coinbase 1-minute candles (browser) | ~1 min after the hour |
| Central Park / Mineola (Long Island) "hits X°F" today and tomorrow, on round 5°F lines near the forecast, only when 12%–88% | NWS forecast high with ~2.5°F (today) / 3.5°F (tomorrow) error, 1°F wider for Mineola | 11:00 AM ET that day | NWS Daily Climate Report: a Yes from the 4 PM report, otherwise the overnight final. Mineola has no climate station, so it settles at JFK Airport, the closest one | Same afternoon or overnight |
| Central Park / Mineola "rain or snow" (≥ 0.01 in), only when 15%–85% | NWS chance of precipitation | Midnight ET as the day begins | NWS Daily Climate Report (JFK Airport for Mineola) | Same afternoon or overnight |
| S&P 500 (SPY) and Nasdaq-100 (QQQ) "up on <day>?" for the next NYSE session | 53% (long-run share of up days) | 9:30 AM ET open | Official closes, fetched every 15 minutes by the deploy job (Yahoo Finance; no browser access) | ~15–30 min after the close |

**Faster game results**: tonight's NFL, college football, NBA, MLB and NHL moneyline markets (two team-name
outcomes) settle from ESPN's public scoreboard as soon as a game is final, instead of waiting hours for
Polymarket's resolution. Only markets whose outcomes match both teams of one ESPN game are settled this way.

## Games

The **Games** tab (between Markets and Leaderboard) has eight casino games that bet with your portfolio cash, the
same $100,000 you trade with. Wins and losses change your net worth, the equity chart and your leaderboard rank
like any trade, and a balance reset covers games too. Visitors can play right away as a guest (see below). Every round is
logged on the portfolio's **Games** tab, with per-game stats (rounds, amount wagered, net) and a "Games this run"
total on the dashboard. Realized PnL still counts market sells and settlements only. All randomness comes from the Web Crypto API with rejection
sampling, so outcomes are unbiased.

- **Roulette**: European single-zero wheel (37 pockets) with an animated SVG wheel and ball. Straight up pays
  35:1, split 17:1, street 11:1, corner 8:1, six line 5:1, dozens and columns 2:1, and red/black, odd/even and
  1-18/19-36 pay 1:1. Click a cell edge or corner for splits, streets, corners and six lines. Undo, clear, double
  and rebet are built in, plus a quick spin switch. After a spin the winning bets stay lit until the next chip goes
  down. On phones the table turns upright so it fits without scrolling.
- **Blackjack**: six-deck shoe reshuffled with about a quarter left. Blackjack pays 3:2, wins 1:1, insurance
  2:1. The dealer peeks under an ace or ten and stands on all 17s, soft 17 included. Double on any first two
  cards, split pairs up to four hands (split aces get one card each). A hand in progress survives a reload.
- **Plinko**: a canvas board with gravity and a bounce off a pin on every row. Choose 8, 12 or 16 rows, low,
  medium or high risk, and 1 to 25 balls at a time. Each ball goes left or right with equal chance at each row,
  so buckets follow a binomial distribution; every row and risk setting returns about 99% over the long run.

- **Dice**: a roll from 0.00 to 100.00. Drag the slider to a target and pick Roll Over or Roll Under; the multiplier,
  target and win chance fields stay linked. Win chances run from 2% to 98% and pay 99 ÷ chance (1.98× at 50%, 49.5×
  at 2%), a 99% return.
- **Mines**: a 5×5 grid with 1 to 24 mines. Each gem pays 0.99 ÷ the chance of getting that far safely (1.03× for a
  gem with 1 mine, 24.75× with 24), a 99% return. Cash out any time, pick random tiles, or set an automatic cash out.
- **Chicken Cross**: hop a chicken lane by lane across traffic. Easy survives 96% of lanes over 30 lanes, Medium 88%
  over 25, Hard 80% over 22 and Daredevil 60% over 18 (up to about 9,600×). Lane n pays 0.98 ÷ chanceⁿ, a 98% return.
  A tilted roadway with moving traffic, a multiplier on every lane's manhole, hop, cash-out and crash animations.
- **Limbo** (with a Crash mode): one draw from 1.00× to 1,000,000× (`floor(2^24 × 99 ÷ (n + 1))` hundredths, where n is the
  first 3 bytes of the HMAC), so reaching x has a 99% ÷ x chance and every target returns 99%. **Limbo** pays your
  target times the bet when the draw reaches it. **Crash** draws the same number as the crash point and grows the
  multiplier as e^(0.00006 × ms) (2× after about 11.6 seconds): cash out before it crashes, or set an auto cash-out.
  The server times the round and keeps the crash point hidden until it's over.
- **Golden Sevens**: a classic 5-reel, 3-row slot with 20 fixed paylines (cherries, lemons, oranges, grapes, bells,
  BARs, sevens and diamonds). Wilds land on reels 2 to 4, stand in for any symbol except the star, and carry a 2×, 3×,
  5× or 10× multiplier; wild multipliers on one line multiply, so three 10× wilds make a line pay 1,000×. 3, 4 or 5
  stars anywhere pay 2×, 10× or 50× the bet and start 10, 15 or 20 free spins where every win pays triple and stars
  add more spins (up to 30). A round pays at most 50,000× the bet. A 20 million round simulation puts the return at
  about 96% (lines 67%, free spins 25%, star pays 3%), with a win on about 43% of spins. Spinning reels that stop one
  by one, payline highlights, Big/Mega/Epic win celebrations, turbo spins, autoplay and Space to spin. It replaced
  Boneyard, whose past rounds stay in players' history.

Dice, Limbo, Golden Sevens, Mines and Chicken Cross have **auto play**: a number of bets, raising the bet by a percentage after a win or a
loss (one click sets up Martingale), and stops at a profit or loss you choose. Mines auto opens the same picked tiles
every round; Chicken Cross auto cashes out at a lane you choose. Each game has its own small synthesized sounds,
which can be muted.

Game pages have short addresses: `#/games/spin` (Roulette), `21` (Blackjack), `balls` (Plinko), `roll` (Dice),
`gems` (Mines), `cross` (Chicken Cross), `target` (Limbo), `rocket` (Crash) and `reels` (Golden Sevens), set in
`src/games/names.js`. The old addresses named after each game still work and redirect. Game pages share one
tab title, "Games · Chami Market", and Roulette and Blackjack are shown as **Spin** and **21**.

Every game also plays from the keyboard: Space bets, spins, drops or deals (and starts or stops auto play), and
games with more moves add letter keys such as C to cash out or H and S to hit and stand. Each game's rules list its
keys. Shortcuts pause while you type in a field or a dialog is open. With reduced motion turned on in the device
settings, games skip the confetti, shakes and long animations.

They are also **provably fair**, using the standard HMAC-SHA256 provably fair scheme: each result comes from
`HMAC-SHA256(server seed, "<client seed>:<nonce>:<round>")`, four bytes per random number. You see the SHA-256 hash
of the server seed before betting, and the nonce counts your bets. The seeds are set by the server and players can't
change them. After 100 bets the pair is retired (never while a Mines, Chicken Cross or Crash round is open), its server
seed is revealed, and the built-in verifier recomputes any dice roll, mine layout, crash lane, Limbo or Crash result
or Golden Sevens spin made with it.
With the backend, the server seed, mine positions and crash lane never leave the server until the round or seed pair
is finished; the database functions use the same formulas, and tests check both produce identical results.

The engines are pure functions in `src/games/` (with tests). A round's stake is taken when it starts and the
payout is credited when the animation ends; if you leave the page mid-spin or mid-drop, the payout is credited
anyway, and a round started before a balance reset is dropped. Game records are stored on the portfolio itself.

## Curation rules

All of these live in `src/utils/curation.js` (with tests) and apply to live data, the snapshot and demo data alike.

- **Topics**: markets about death, violence, war, crime and arrests, sex or drugs are hidden, since students use
  the site. Whole words only, so team names like the Warriors still pass.
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

This section describes **local mode** (no backend configured). With the backend, see
[Backend](#backend-supabase): accounts and portfolios live on the server instead.

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

## Guests

Nobody has to sign up to play. Once a visitor accepts the first-visit Terms pop-up they play as a **guest** with
their own $100,000, trading and playing every game. Guests:

- show as **Guest** in the market and game feeds, and are kept off the leaderboard;
- keep their progress on this device between visits (the session is remembered);
- keep **everything** when they sign up: the guest account itself gets the username and password, so the balance,
  open positions, trade history and game stats carry over. Signing up with an email works the same way;
- don't merge into an existing account when they log in instead (the log-in form says so), because that would let
  anyone pour fresh $100,000 guest balances into one account.

With the backend, a guest is a Supabase anonymous user. A guest nobody played as is removed after a day, and an
idle one after 30 days, by the scheduled sync. In local mode the guest is a password-less account in the browser.

## Backend (Supabase)

Without a backend every browser is its own little world: accounts, the leaderboard and the feed only cover that
browser. Connecting a free [Supabase](https://supabase.com) project turns Chami Market into one shared game:

- **Real accounts** with a username or email and a password. Signing up with an email also asks for a username to
  show on the leaderboard (the email stays the login); a username sign-up needs no email. No Google or other sign-in, no confirmation email
  and no links. At sign-up each player gets a one-time **recovery code** (like `K7QM-2XRP-9WDT`); it is the only
  way to reset a forgotten password, and using it issues a new one. A new code can be made from the account menu.
- **Fair play rules on the server**: hourly crypto markets are priced from live Coinbase spot at trade time (the
  browser shows the same live price), Polymarket trades stop once a market stops taking orders, payouts round
  down to the cent, balance resets need a 5-minute wait between them, and refused trades still count toward rate limits.
  Usernames can't copy a simulated player or look official (look-alikes such as `quietkeIIy` included).
- **Delete account** in the account menu, after typing DELETE to confirm. The server
  (`delete_account`) removes the login and everything tied to it, including leaderboard rows and feed entries.
- **Feedback**: a slim Feedback tab on the right edge (backend mode) sends suggestions and bug reports to a
  private `feedback` table that only the service role can read. Read them in the Supabase Table Editor, or run
  Actions › "Admin - feedback report" with a public key from `node scripts/decrypt-feedback.mjs keys <dir>`: the
  report is encrypted (the repository's logs are public), and `node scripts/decrypt-feedback.mjs read <dir> <log>`
  decrypts a saved run log. Limits: 5 an hour per player, 20 an hour from all guests, 1,000 a day, 2,000 unread.
- **Removing a player as the site owner**: Actions tab › "Admin - delete a player" › Run workflow, with their
  username and DELETE. It deletes their login with the service role key and everything else cascades with it.
  Both admin workflows run in an `admin` environment: add yourself as its required reviewer (Settings ›
  Environments › admin) so no run starts without your approval.
- **Terms**: a first-visit pop-up with a link to the full Terms of Use, a "play at your own risk" warning (schools
  like Chaminade don't allow gambling or games of chance, even with play money) and one "I understand and agree" button
  (`#/terms`). Agreement is stored per browser and versioned by `TERMS_VERSION` in `src/config.js`, and sign-ups
  record the accepted version in the account's metadata.
- **A true leaderboard**: every player, valued on the server, on the Overall, Markets and Games boards.
- **A live feed** of everyone's trades and game results over Supabase Realtime.
- **Privacy**: the feeds and profiles show only usernames. Nobody can read which account a feed row belongs to,
  when an account was made, or anyone's email, and password recovery answers the same way whether or not an
  account exists.
- **Cheat-proof money.** The browser can only read; it can't write any table. Every buy, sell, reset, payout and
  game round runs in a database function (`supabase/schema.sql`) that locks the account, prices trades from the
  server's own data (Polymarket trades also check the live API), rejects a trade if the price the player saw is
  more than 3¢ off, and rolls game outcomes with a cryptographic RNG on the server. Blackjack's shoe and the
  dealer's hole card never leave the server. Calls are rate limited per player.
- While the site is new, simulated players (tagged SIM) top the leaderboard up to 15 rows, and one drops off for
  every real player who joins. A few SIM market trades also trickle into the live feed when real trading is quiet.
  Game results from every player get their own **Live games** feed on the Games lobby, with no simulated entries.

The app picks the mode at build time: with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set it uses the
backend, otherwise it stays in local mode. Accounts made in local mode don't move over; players sign up again.

### Setup

1. **Create a project** at [supabase.com](https://supabase.com) (the free tier is plenty for a small site).
2. **Create the database**: open **SQL Editor**, paste all of `supabase/schema.sql` and press **Run**. It is safe
   to run again after you update the code.
3. **Allow live prices (recommended)**: under **Database > Extensions**, make sure **http** is enabled. Without
   it, Polymarket trades use the prices the sync job stores every few minutes.
4. **Configure sign-in** under **Authentication > Sign In / Providers**:
   - **Email**: enabled, and turn **Confirm email** off. Players sign in right away and no email is ever sent.
   - **Allow anonymous sign-ins**: on, so visitors can play as a guest without an account (see
     [Guests](#guests)). With it off, everyone logs in before playing, as before.
   - Leave every other provider off.
   - Under **Authentication > Rate Limits**, raise the sign-up and sign-in limits if many players sign up
     from one shared network (they share an IP address).
5. **Copy the keys** from **Project Settings > API**: the **Project URL**, the **anon / publishable** key (public)
   and the **service_role / secret** key (private, never put it in the site or a `VITE_` variable).
6. **Add them to GitHub** under **Settings > Secrets and variables > Actions**:
   - Variables: `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   - Secret: `SUPABASE_SERVICE_ROLE_KEY`
7. **Deploy**: re-run the Pages deploy (or push to `main`). Within five minutes the **Sync backend** workflow
   starts filling in markets and results. Run it by hand from the Actions tab to start right away.

On Vercel or Netlify, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables instead (the
sync job still runs on GitHub). For local development copy `.env.example` to `.env.local`.

### Faster sync

GitHub starts scheduled workflows late on busy days, sometimes hours late, which delays settlements. A run that is
asked for through the API starts right away, so the database can ask for one every 5 minutes itself (pg_cron and
pg_net; see the end of `supabase/schema.sql`). One-time setup:

1. **Make a GitHub token** at GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained
   tokens** > Generate new token. Repository access: **Only select repositories**, pick this repository.
   Permissions: **Actions: Read and write** (nothing else). Pick an expiration and note the date.
2. **Turn on the extensions** in Supabase under **Database > Extensions**: **pg_cron** and **pg_net** (re-running the
   schema tries to turn them on too).
3. **Save the token in Vault**: in the SQL Editor run
   `select vault.create_secret('github_pat_…', 'github_dispatch_token');` with your token. It is stored encrypted and
   only the database can read it; it never goes into the site.
4. **Run `supabase/schema.sql` again.** It schedules the `chami-sync` job.

To check it: `select * from cron.job;` lists the job, and
`select status_code, created from net._http_response order by created desc limit 5;` shows GitHub's answers (204
means the run was started). When the token expires, make a new one and run
`select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), 'github_pat_…');`.
Without a token nothing breaks: the GitHub schedule keeps running the sync, just less punctually.

### How it fits together

- **Prices and results**: `scripts/sync-backend.mjs` runs every 5 minutes (`.github/workflows/sync-backend.yml`,
  started by the database once [Faster sync](#faster-sync) is set up, and by GitHub's own schedule as a backup).
  It builds the same curated Polymarket, Chaminade and Quick listings as the app, stores them in the `markets`
  table, checks every held market against its official source and settles winners for every player at once. The
  app lists Chaminade and Quick markets from that table, so the price a player sees is the price the server
  trades at. It also keeps a free Supabase project from pausing for inactivity.
- **Settlement timing**: results land on the next sync run, usually within 5 to 10 minutes (GitHub can delay
  scheduled runs at busy times). Polymarket markets a player holds are also checked the moment they're due.
- **Username logins**: Supabase signs people in by email, so a username-only account gets a private placeholder
  address (`<username>@users.chamimarket.app`). Nothing is ever sent to it. Set `VITE_USERNAME_EMAIL_DOMAIN`
  before launch if you want a different domain; changing it later breaks existing username logins.
- **Testing**: `npm run test:db` runs `supabase/tests/schema.test.sql` (sign-up, row level security, trades,
  price checks, settlement, retired parlays, every game with rigged decks, the leaderboard, resets, rate limits and
  recovery codes) against a local Postgres, using `supabase/tests/supabase-stub.sql` in place of Supabase's auth
  schema. CI runs it on every deploy.

## Security

The site itself holds no secret: every upstream API is public, and the Supabase anon key is public by design
(row level security and function grants decide what it can do). The service key only lives in GitHub's secrets
for the sync job. Hardening in place:

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

In local mode anyone with access to the browser can read or edit `localStorage`, including balances and the
session. That's fine for a single-browser demo; the Supabase backend is what makes balances trustworthy.

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
  games/        Game engines, provably fair RNG, physics and sounds (with Vitest tests)
  store/        Zustand stores: markets, accounts and portfolios, resolutions, feed, games, toasts, UI
  utils/        Pure financial math, formatters, storage, validation, hashing, safe keys (with Vitest tests)
  hooks/        Polling, debounce, price flash, portfolio metrics, leaderboard
  services/backend/  Supabase client: sign-in, portfolio, trades, games, leaderboard, live feed
supabase/
  schema.sql    Tables, row level security and every server-side money function
  tests/        Database tests and a local stand-in for Supabase's auth schema
scripts/        Snapshot job, backend sync job and the shared server-side data sources
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
- In local mode the activity feed only shows real trades made in this browser, alongside simulated ones, and the
  leaderboard's pro traders are simulated portfolios, tagged as such. With the backend, real players replace them
  as they join.
- With the backend, a new Quick market can take up to one sync run to become tradable, and the hourly crypto
  markets pause trading if their synced price is more than about 12 minutes old.
- Markets that drop out of the live listing keep their last known price unless you hold them (held markets are
  refreshed individually).
- Polymarket markets that resolve 50/50 (no clear winner) are not settled automatically.
- The keyword lists behind the curation rules can't catch everything; they are easy to extend in
  `src/utils/curation.js`.
