# RedBook Markets

A paper trading prediction market. Browse live Sports and Top Politics odds, buy and sell Yes/No shares with
**play money**, and track your PnL, net worth and rank. Everything runs in the browser: there is no backend, no
real money, nothing to fund and nothing to cash out.

> **Paper trading, play money only.** RedBook Markets is an independent demo. It is not affiliated with, endorsed
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

Requires Node 20.19+ (Node 22 recommended).

## Features

- **Discovery**: Sports and Top Politics only, a debounced live search (title and rules text, case-insensitive,
  combined with the category filter) and sorting by volume, newest or ending soon.
- **Market detail**: probability chart with 1D/1W/1M/All ranges, order book, rules, your position, and a sticky
  trade panel (a bottom sheet on mobile).
- **Paper trading**: instant market orders, live preview of shares, average price, payout, profit and ROI;
  partial or full sells; volume-weighted average buy price.
- **Portfolio**: net worth, available funds, unrealized and realized PnL, cost basis, open positions, win rate,
  resets used, an equity chart, a positions table and trade history with a closed/settled filter.
- **Settlement**: a "Resolve market (test)" control, plus automatic settlement when the live API reports a
  market closed with a clear winner.
- **Reset**: back to $50,000 behind a confirmation modal that requires typing `RESET`.
- **Social**: an activity feed mixing your local trades with clearly tagged simulated trades, and a leaderboard
  of local accounts plus simulated pro traders.
- **Guest mode**: everything is browsable without an account; trading, the portfolio and resets need one.

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
| Market list and prices  | Gamma `GET /markets?tag_id=…&active=true&closed=false&liquidity_num_min=…`, falling back to `GET /events?tag_id=…` |
| Held markets            | Gamma `GET /markets/{id}` (also used to detect resolved markets)          |
| Order book              | CLOB `GET /book?token_id=…`                                               |
| Price history           | CLOB `GET /prices-history?market={token}&interval=…&fidelity=…`           |

- Tag ids are discovered at startup, not hardcoded, and cached with the market list.
- Only active, open, binary markets with at least $1,000 liquidity and prices inside (0, 1) are listed.
- `outcomes`, `outcomePrices` and `clobTokenIds` may arrive as JSON-encoded strings; numbers may arrive as strings.
  Every field is parsed and validated in `src/services/normalize.js`; anything malformed is dropped.
- Prices refresh every 20 seconds (order books too, on the market page). Polling stops while
  `document.visibilityState` is `hidden` and resumes when you come back.
- `src/services/http.js` adds request timeouts, in-flight de-duplication, a short response memo, a per-host
  request budget, and a cooldown after HTTP 429 (honouring `Retry-After`) to stay well inside public rate limits.
- The last good listing is cached in `localStorage` for instant startup (used if under 24 hours old).
- **Fallback**: on timeouts, CORS or network errors, rate limits or malformed responses the app silently switches
  to a bundled dataset (13 Sports and 12 Politics markets with synthetic order books and price history) and the
  header shows **Offline demo data**. Demo prices drift slightly on each poll so the app still feels alive. If
  live data was already loaded, it is kept and marked as reconnecting instead.
- When no price history is available, the chart shows a deterministic synthetic series that ends at the current
  price and is labelled as simulated. Missing order books are replaced with a labelled simulated book.

## Accounts and storage

Sign up and log in use a username or email plus a password. Accounts, sessions, portfolios, trade history,
equity snapshots, resolutions, the cached market list and the shared activity feed live in `localStorage` under
`redbook:*` keys, with a schema version and migration hook. Every read is validated; corrupted values are
discarded (falling back to defaults) and storage falls back to memory in private mode. History, snapshots, the
feed and cached markets are all capped. Several accounts can share a browser with fully separate portfolios, and
other tabs stay in sync through `storage` events.

> **Demo-grade auth.** Passwords are salted and hashed with PBKDF2-SHA-256 via the Web Crypto API and plaintext
> is never stored, but a client-side account system is not secure: anyone with access to the browser can read or
> edit the data. Don't reuse a real password. Web Crypto needs HTTPS or `localhost`.

When a market resolves (test control or API), the active account is settled immediately. Other local accounts
are settled automatically the next time they log in.

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
  store/        Zustand stores: markets, accounts and portfolios, resolutions, feed, toasts, UI
  utils/        Pure financial math, formatters, storage, validation, hashing (with Vitest tests)
  hooks/        Polling, debounce, price flash, portfolio metrics, leaderboard
```

## Assumptions

- Gamma and CLOB endpoints answer browser requests with permissive CORS headers. If a host blocks them, the app
  runs on demo data.
- `outcomePrices[0]` is the Yes (first outcome) price and `clobTokenIds[0]` its CLOB token. Two-outcome markets with
  other labels (for example two team names) are shown with those labels.
- Gamma `/markets` honours `tag_id`, `active`, `closed`, `order=volume24hr` and `liquidity_num_min`; if the list
  comes back empty or errors, `/events?tag_id=…` is used instead.
- A closed market is treated as resolved only when one outcome is priced at 0.99 or higher and the other at
  0.01 or lower.

## Known limitations

- Market orders fill entirely at the displayed price; there is no order book matching, slippage or fees.
- The activity feed only shows real trades made in this browser, alongside simulated ones.
- Leaderboard pro traders are simulated portfolios, tagged as such.
- Markets that drop out of the live listing keep their last known price unless you hold them (held markets are
  refreshed individually).
- Local resolutions are permanent for this browser, even if the real market later resolves differently.
