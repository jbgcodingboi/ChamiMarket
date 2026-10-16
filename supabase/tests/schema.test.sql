-- Tests for supabase/schema.sql on a plain Postgres with supabase-stub.sql.
-- Run with: npm run test:db
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike p_like then return; end if;
    raise exception 'expected error like "%" from %, got "%"', p_like, p_sql, sqlerrm;
  end;
  raise exception 'expected an error like "%" from %', p_like, p_sql;
end $$;
grant execute on function pg_temp.expect_error(text, text) to anon, authenticated, service_role;

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAILED: %', p_msg; end if;
  raise notice 'ok: %', p_msg;
end $$;
grant execute on function pg_temp.ok(boolean, text) to anon, authenticated, service_role;
-- Lets the tests play faster than the per-minute limits allow.
create or replace function pg_temp.clear_limits() returns void language sql security definer as $$ delete from private.rate_limits $$;
grant execute on function pg_temp.clear_limits() to anon, authenticated, service_role;
-- Read-only peeks at internals the client roles can't reach.
create or replace function pg_temp.mults(p_rows int, p_risk text) returns numeric[] language sql security definer as $$ select private.plinko_table(p_rows, p_risk) $$;
create or replace function pg_temp.bj_total(p_cards jsonb) returns int language sql security definer as $$ select (private.bj_value(p_cards)).total $$;
grant execute on function pg_temp.mults(int, text), pg_temp.bj_total(jsonb) to authenticated;
set client_min_messages = notice;

-- Sign-up -------------------------------------------------------------------
insert into auth.users (email, raw_user_meta_data) values ('alice@users.test', '{"username":"alice"}'), ('bob@example.com', '{"username":"bob"}');
select id as alice from auth.users where email = 'alice@users.test' \gset
select id as bob from auth.users where email = 'bob@example.com' \gset
select pg_temp.ok((select cash from public.portfolios where user_id = :'alice') = 100000, 'new accounts start with $100,000');
select pg_temp.ok((select count(*) from public.equity_snapshots where user_id = :'alice') = 1, 'sign-up records a first equity snapshot');
select pg_temp.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('c@x.test', '{"username":"ALICE"}')$$, '%duplicate%');
select pg_temp.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('d@x.test', '{"username":"no spaces"}')$$, '%username%');

-- Markets (as the sync job) -------------------------------------------------
set role service_role;
select pg_temp.ok(public.sync_markets(jsonb_build_array(
  jsonb_build_object('id', '123', 'title', 'Will it rain?', 'category', 'sports', 'yesPrice', 0.6, 'noPrice', 0.4,
    'endDate', now() + interval '2 days', 'labels', jsonb_build_object('yes', 'Yes', 'no', 'No')),
  jsonb_build_object('id', '456', 'title', 'Ended game', 'category', 'sports', 'yesPrice', 0.5, 'noPrice', 0.5, 'endDate', now() - interval '1 hour'),
  jsonb_build_object('id', 'cham-1-20991020-win', 'title', 'Chaminade wins?', 'category', 'chaminade', 'yesPrice', 0.7, 'noPrice', 0.3,
    'endDate', now() + interval '1 day', 'gameStart', now() + interval '1 day'),
  jsonb_build_object('id', 'cham-2-20991021-win', 'title', 'Chaminade wins again?', 'category', 'chaminade', 'yesPrice', 0.6, 'noPrice', 0.4,
    'endDate', now() + interval '2 days'),
  jsonb_build_object('id', 'bad id!', 'title', 'x', 'yesPrice', 0.5, 'noPrice', 0.5),
  jsonb_build_object('id', 'q-btc-above-80000-1', 'title', 'BTC above?', 'category', 'quick', 'yesPrice', 0.5, 'noPrice', 0.5, 'endDate', now() + interval '1 hour')
)) = 5, 'sync_markets stores valid markets and skips bad ids');
reset role;
update public.markets set updated_at = now() - interval '20 minutes' where id = 'q-btc-above-80000-1';

-- Row level security --------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'alice', false);
select pg_temp.ok((select count(*) from public.portfolios) = 1, 'players only see their own portfolio');
select pg_temp.ok((select count(*) from public.profiles) = 2, 'usernames are public');
select pg_temp.expect_error($$update public.portfolios set cash = 1e9$$, '%permission denied%');
select pg_temp.expect_error($$insert into public.positions (user_id, market_id, side, shares, cost_basis) values (auth.uid(), '123', 'yes', 1, 0)$$, '%permission denied%');
select pg_temp.expect_error($$select * from public.blackjack_tables$$, '%permission denied%');
select pg_temp.expect_error($$select public.sync_markets('[]')$$, '%permission denied%');
select pg_temp.expect_error($$select public.sync_resolutions('{"123":"yes"}')$$, '%permission denied%');
select pg_temp.expect_error($$select private.settle_market('123', 'yes')$$, '%permission denied%');
select pg_temp.expect_error($$select private.rand_int(10)$$, '%permission denied%');

-- Trading -------------------------------------------------------------------
select pg_temp.ok((public.buy('123', 'yes', 100, 0.6) ->> 'shares')::numeric = 166.6667, 'buy $100 at 60¢ gets 166.6667 shares');
select pg_temp.ok((public.get_portfolio() ->> 'cash')::numeric = 99900, 'cash drops by the amount spent');
select pg_temp.expect_error($$select public.buy('123', 'yes', 100, 0.5)$$, '%price moved to 60%');
select pg_temp.expect_error($$select public.buy('123', 'yes', 200000, 0.6)$$, '%exceeds your available cash%');
select pg_temp.expect_error($$select public.buy('123', 'yes', 'NaN', 0.6)$$, '%at least $0.01%');
select pg_temp.expect_error($$select public.buy('123', 'yes', 0.001, 0.6)$$, '%at least $0.01%');
select pg_temp.expect_error($$select public.buy('456', 'yes', 10, 0.5)$$, '%event has ended%');
select pg_temp.expect_error($$select public.buy('nope', 'yes', 10, 0.5)$$, '%not available%');
select pg_temp.expect_error($$select public.buy('q-btc-above-80000-1', 'yes', 10, 0.5)$$, '%refreshing%');
select pg_temp.expect_error($$select public.buy('123', 'maybe', 10, 0.5)$$, '%Yes or No%');
select pg_temp.ok((public.sell('123', 'yes', 66.6667, 0.6) ->> 'proceeds')::numeric = 40, 'selling 66.6667 shares at 60¢ returns $40');
select pg_temp.ok((public.get_portfolio() -> 'positions' -> '123:yes' ->> 'shares')::numeric = 100, '100 shares left after a partial sale');
select pg_temp.expect_error($$select public.sell('123', 'yes', 1000, 0.6)$$, '%only own%');
select pg_temp.ok((public.buy('cham-1-20991020-win', 'no', 30, 0.3) ->> 'shares')::numeric = 100, 'house markets trade at the synced price');

-- Parlay priced from its legs: 0.7 x 0.6 = 0.42.
select pg_temp.ok((public.buy('q-parlay-cham-1-20991020-win_y~cham-2-20991021-win_y', 'yes', 42, 0.42) ->> 'price')::numeric = 0.42, 'parlays are priced from their legs');

-- Settlement ----------------------------------------------------------------
reset role;
set role service_role;
select pg_temp.ok(public.held_markets() @> '["123"]', 'held_markets lists open positions');
select pg_temp.ok(public.sync_resolutions('{"123": {"outcome": "yes", "title": "Will it rain?"}}') = 1, 'a result settles one position');
select pg_temp.ok(public.sync_resolutions('{"123": "no"}') = 0, 'a market settles only once');
select pg_temp.ok(public.sync_resolutions('{"cham-1-20991020-win": "void"}') = 1, 'void results refund');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'alice', false);
-- 99900 + 40 (sale) - 30 (house) - 42 (parlay) + 100 (win) + 30 (void refund)
select pg_temp.ok((public.get_portfolio() ->> 'cash')::numeric = 99998, 'payouts land in cash: winners $1 a share, voids at cost');
select pg_temp.ok((public.get_portfolio() ->> 'realizedPnl')::numeric = 40, 'realized PnL counts the sale ($0) and the win ($40)');
select pg_temp.expect_error($$select public.buy('123', 'yes', 10, 1)$$, '%resolved%');

-- Roulette ------------------------------------------------------------------
select pg_temp.expect_error($$select public.play_roulette('[{"key":"split:1-5","amount":10}]')$$, '%Invalid bet%');
select pg_temp.expect_error($$select public.play_roulette('[{"key":"straight:1-2-3","amount":10}]')$$, '%Invalid bet%');
select pg_temp.expect_error($$select public.play_roulette('[{"key":"corner:3-4-6-7","amount":10}]')$$, '%Invalid bet%');
select pg_temp.expect_error($$select public.play_roulette('[{"key":"red:1-2","amount":10}]')$$, '%Invalid bet%');
select pg_temp.expect_error($$select public.play_roulette('[{"key":"straight:7","amount":0.5}]')$$, '%at least $1%');
do $$
declare r jsonb; n int; red int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]; i int; hits int := 0;
begin
  for i in 1..300 loop
    perform pg_temp.clear_limits();
    r := public.play_roulette(jsonb_build_array(
      jsonb_build_object('key', 'red:1-3-5-7-9-12-14-16-18-19-21-23-25-27-30-32-34-36', 'amount', 2),
      jsonb_build_object('key', 'straight:17', 'amount', 1),
      jsonb_build_object('key', 'split:17-20', 'amount', 1),
      jsonb_build_object('key', 'corner:17-18-20-21', 'amount', 1)));
    n := (r ->> 'result')::int;
    if (r ->> 'returned')::numeric <> (case when n = any (red) then 4 else 0 end) + (case when n = 17 then 36 else 0 end)
      + (case when n in (17, 20) then 18 else 0 end) + (case when n in (17, 18, 20, 21) then 9 else 0 end) then
      raise exception 'roulette paid % on %', r ->> 'returned', n;
    end if;
    if n = any (red) then hits := hits + 1; end if;
  end loop;
  perform pg_temp.ok(hits between 100 and 200, format('300 spins pay exact odds (red came up %s times)', hits));
end $$;

-- Plinko --------------------------------------------------------------------
select pg_temp.expect_error($$select public.play_plinko(10, 10, 'low', 1)$$, '%rows%');
select pg_temp.expect_error($$select public.play_plinko(10, 16, 'low', 26)$$, '%between 1 and 25%');
do $$
declare r jsonb; b jsonb; before numeric; mults numeric[] := pg_temp.mults(16, 'high');
begin
  before := (public.get_portfolio() ->> 'cash')::numeric;
  r := public.play_plinko(10, 16, 'high', 25);
  for b in select * from jsonb_array_elements(r -> 'balls') loop
    if jsonb_array_length(b -> 'path') <> 16 then raise exception 'path length'; end if;
    if (select sum(x::int) from jsonb_array_elements_text(b -> 'path') x) <> (b ->> 'bucket')::int then raise exception 'bucket'; end if;
    if (b ->> 'returned')::numeric <> round(10 * mults[(b ->> 'bucket')::int + 1], 2) then raise exception 'payout'; end if;
  end loop;
  perform pg_temp.ok((public.get_portfolio() ->> 'cash')::numeric = before - 250 + (r ->> 'returned')::numeric, '25 Plinko balls pay their buckets');
end $$;
select pg_temp.ok(array_length(pg_temp.mults(8, 'low'), 1) = 9 and array_length(pg_temp.mults(16, 'high'), 1) = 17, 'Plinko tables have rows + 1 buckets');

-- Blackjack -----------------------------------------------------------------
reset role;
create or replace function pg_temp.rig(p_user uuid, p_ranks text[]) returns void language plpgsql security definer as $$
declare shoe jsonb := '[]'; r text; i int := 0;
begin
  foreach r in array p_ranks loop shoe := shoe || jsonb_build_array(jsonb_build_object('rank', r, 'suit', '♠', 'id', 'r' || i)); i := i + 1; end loop;
  for i in 1..200 loop shoe := shoe || jsonb_build_array(jsonb_build_object('rank', '2', 'suit', '♣', 'id', 'f' || i)); end loop;
  insert into public.blackjack_tables (user_id, state) values (p_user, jsonb_build_object('phase', 'betting', 'shoe', shoe, 'cut', 0,
    'dealer', '[]'::jsonb, 'hands', '[]'::jsonb, 'active', 0, 'insurance', 0, 'result', null))
  on conflict (user_id) do update set state = excluded.state;
end $$;
grant execute on function pg_temp.rig(uuid, text[]) to authenticated;
set role authenticated;

do $$
declare r jsonb; before numeric; me uuid := auth.uid();
begin
  -- Dealer stands on soft 17: player 18 beats dealer A+6.
  perform pg_temp.rig(me, array['10', '6', '8', 'A']);
  before := (public.get_portfolio() ->> 'cash')::numeric;
  r := public.blackjack_deal(100);
  perform pg_temp.ok(r -> 'table' ->> 'phase' = 'player' and r -> 'table' -> 'dealer' -> 1 ->> 'hidden' = 'true' and not (r -> 'table') ? 'shoe',
    'the hole card and the shoe stay on the server');
  perform pg_temp.expect_error($q$select public.blackjack_deal(100)$q$, '%Finish the current hand%');
  r := public.blackjack_act('stand');
  perform pg_temp.ok(r -> 'table' -> 'hands' -> 0 ->> 'outcome' = 'win' and jsonb_array_length(r -> 'table' -> 'dealer') = 2,
    'dealer stands on soft 17');
  perform pg_temp.ok((public.get_portfolio() ->> 'cash')::numeric = before + 100, 'a win pays 1:1');

  -- Blackjack pays 3:2.
  perform pg_temp.rig(me, array['A', '9', 'K', '7']);
  before := (public.get_portfolio() ->> 'cash')::numeric;
  r := public.blackjack_deal(100);
  perform pg_temp.ok(r -> 'table' -> 'hands' -> 0 ->> 'outcome' = 'blackjack' and (public.get_portfolio() ->> 'cash')::numeric = before + 150,
    'blackjack pays 3:2');

  -- Insurance pays 2:1 against a dealer blackjack.
  perform pg_temp.rig(me, array['10', 'A', '9', 'K']);
  before := (public.get_portfolio() ->> 'cash')::numeric;
  r := public.blackjack_deal(100);
  perform pg_temp.ok(r -> 'table' ->> 'phase' = 'insurance', 'insurance is offered under an ace');
  r := public.blackjack_act('insurance');
  perform pg_temp.ok((r -> 'table' -> 'result' ->> 'insuranceBack')::numeric = 150 and (public.get_portfolio() ->> 'cash')::numeric = before,
    'insurance pays 2:1, so the hand breaks even');

  -- Split aces get one card each; 21 after a split is not a blackjack.
  perform pg_temp.rig(me, array['A', '9', 'A', '7', 'K', '5', '10']);
  before := (public.get_portfolio() ->> 'cash')::numeric;
  r := public.blackjack_deal(100);
  perform pg_temp.ok((r -> 'table' ->> 'canSplit')::boolean, 'a pair can be split');
  r := public.blackjack_act('split');
  perform pg_temp.ok(r -> 'table' ->> 'phase' = 'done'
    and r -> 'table' -> 'hands' -> 0 ->> 'outcome' = 'win' and r -> 'table' -> 'hands' -> 1 ->> 'outcome' = 'win'
    and (public.get_portfolio() ->> 'cash')::numeric = before + 200, 'split aces: two wins at 1:1, no 3:2');

  -- Double down: 11 + 10 = 21 pushes against the dealer's 21.
  perform pg_temp.rig(me, array['5', '6', '6', '10', '10', '5']);
  before := (public.get_portfolio() ->> 'cash')::numeric;
  r := public.blackjack_deal(100);
  r := public.blackjack_act('double');
  perform pg_temp.ok(r -> 'table' -> 'hands' -> 0 ->> 'outcome' = 'push' and (r -> 'table' -> 'hands' -> 0 ->> 'bet')::numeric = 200
    and (public.get_portfolio() ->> 'cash')::numeric = before, 'a doubled push returns both bets');
  perform pg_temp.expect_error($q$select public.blackjack_act('hit')$q$, '%Deal first%');
end $$;

-- A long random session never creates or loses money.
do $$
declare r jsonb; before numeric; i int; k int; staked numeric := 0; returned numeric := 0; table_ jsonb;
begin
  before := (public.get_portfolio() ->> 'cash')::numeric;
  for i in 1..150 loop
    perform pg_temp.clear_limits();
    r := public.blackjack_deal(10);
    k := 0;
    while r -> 'table' ->> 'phase' <> 'done' and k < 60 loop
      if r -> 'table' ->> 'phase' = 'insurance' then
        r := public.blackjack_act(case when i % 2 = 0 then 'insurance' else 'no_insurance' end);
      elsif (r -> 'table' ->> 'canSplit')::boolean and i % 3 = 0 then
        r := public.blackjack_act('split');
      elsif (r -> 'table' ->> 'canDouble')::boolean and i % 5 = 0 then
        r := public.blackjack_act('double');
      elsif pg_temp.bj_total(r -> 'table' -> 'hands' -> (r -> 'table' ->> 'active')::int -> 'cards') < 15 then
        r := public.blackjack_act('hit');
      else
        r := public.blackjack_act('stand');
      end if;
      k := k + 1;
    end loop;
    if r -> 'table' ->> 'phase' <> 'done' then raise exception 'hand stuck in %: %', r -> 'table' ->> 'phase', r -> 'table'; end if;
    staked := staked + (r -> 'table' -> 'result' ->> 'staked')::numeric;
    returned := returned + (r -> 'table' -> 'result' ->> 'returned')::numeric;
  end loop;
  perform pg_temp.ok((public.get_portfolio() ->> 'cash')::numeric = before - staked + returned,
    format('150 random hands balance to the cent (staked %s, returned %s)', staked, returned));
end $$;

-- Provably fair games ---------------------------------------------------------
reset role;
-- Known seeds, so results can be checked against src/games (see src/games/fairgames.test.js vectors).
insert into public.fair_seeds (user_id, server_seed, client_seed, nonce) values (:'alice', repeat('b', 64), 'chami', 0)
on conflict (user_id) do update set server_seed = excluded.server_seed, client_seed = excluded.client_seed, nonce = 0;
set role authenticated;
select set_config('request.jwt.claim.sub', :'alice', false);
select pg_temp.clear_limits();
select pg_temp.expect_error($$select * from public.fair_seeds$$, '%permission denied%');
select pg_temp.expect_error($$select * from public.game_states$$, '%permission denied%');
select pg_temp.ok(public.fair_state() ->> 'serverSeedHash' = 'a0fab1377f49a759b57f63318262ebe89fabfc990e8e93ceac2984561482b9d4'
  and not public.fair_state() ? 'serverSeed', 'only the hash of the active server seed is shown');

do $$
declare r jsonb; before numeric := (public.get_portfolio() ->> 'cash')::numeric;
begin
  r := public.play_dice(10, 50, true);
  perform pg_temp.ok((r ->> 'roll')::int = 9490 and (r ->> 'nonce')::int = 0 and (r ->> 'win')::boolean
    and (r ->> 'multiplier')::numeric = 1.98 and (r ->> 'payout')::numeric = 19.8, 'dice nonce 0 rolls 94.90, the same as the browser engine');
  r := public.play_dice(10, 80, false);
  perform pg_temp.ok((r ->> 'roll')::int = 8371 and not (r ->> 'win')::boolean and (r ->> 'payout')::numeric = 0
    and (r ->> 'multiplier')::numeric = 1.2375, 'dice nonce 1 rolls 83.71 and loses under 80 (1.2375x)');
  perform pg_temp.ok((public.get_portfolio() ->> 'cash')::numeric = before - 20 + 19.8, 'dice pays from cash');
  perform pg_temp.expect_error($q$select public.play_dice(10, 1, true)$q$, '%between 2 and 98%');
  perform pg_temp.expect_error($q$select public.play_dice(0.05, 50, true)$q$, '%at least $0.10%');
end $$;

do $$
declare r jsonb; before numeric := (public.get_portfolio() ->> 'cash')::numeric;
begin
  perform pg_temp.expect_error($q$select public.mines_reveal(3)$q$, '%Start a round%');
  perform pg_temp.expect_error($q$select public.mines_start(10, 25)$q$, '%1 to 24 mines%');
  r := public.mines_start(10, 3);
  perform pg_temp.ok(r -> 'round' ->> 'phase' = 'playing' and not (r -> 'round') ? 'positions' and r -> 'round' -> 'result' = 'null'
    and (r -> 'round' ->> 'nonce')::int = 2, 'mine positions stay on the server during a round');
  perform pg_temp.expect_error($q$select public.mines_start(10, 3)$q$, '%current round%');
  perform pg_temp.expect_error($q$select public.fair_rotate('new-seed')$q$, '%Finish your Mines%');
  perform pg_temp.expect_error($q$select public.mines_cashout()$q$, '%at least one tile%');
  r := public.mines_reveal(0);
  perform pg_temp.ok((r -> 'round' ->> 'multiplier')::numeric = 1.12 and (r -> 'round' ->> 'nextMultiplier')::numeric = 1.28, 'one gem with 3 mines is 1.12x, next 1.28x');
  perform pg_temp.expect_error($q$select public.mines_reveal(0)$q$, '%already open%');
  r := public.mines_reveal(1);
  r := public.mines_cashout();
  perform pg_temp.ok(r -> 'round' -> 'result' -> 'positions' = '[6, 7, 24]' and (r -> 'round' -> 'result' ->> 'payout')::numeric = 12.8,
    'cashing out two gems pays 1.28x and reveals mines 6, 7 and 24, the same as the browser engine');
  perform pg_temp.ok((public.get_portfolio() ->> 'cash')::numeric = before + 2.8, 'mines pays from cash');
end $$;

do $$
declare r jsonb; i int; before numeric := (public.get_portfolio() ->> 'cash')::numeric;
begin
  r := public.chicken_start(10, 'medium');
  perform pg_temp.ok(not (r -> 'round') ? 'crash' and (r -> 'round' ->> 'nonce')::int = 3 and (r -> 'round' ->> 'lanes')::int = 25,
    'the crash lane stays on the server');
  for i in 1..5 loop r := public.chicken_step(); end loop;
  perform pg_temp.ok((r -> 'round' ->> 'lane')::int = 5 and (r -> 'round' ->> 'multiplier')::numeric = 1.85, 'five medium lanes reach 1.85x');
  r := public.chicken_step();
  perform pg_temp.ok(r -> 'round' ->> 'phase' = 'done' and (r -> 'round' -> 'result' ->> 'hitLane')::int = 6
    and (r -> 'round' -> 'result' ->> 'payout')::numeric = 0, 'nonce 3 is hit on medium lane 6, the same as the browser engine');
  perform pg_temp.ok((public.get_portfolio() ->> 'cash')::numeric = before - 10, 'a hit loses the bet');
  perform pg_temp.expect_error($q$select public.chicken_step()$q$, '%Start a round%');
  perform pg_temp.expect_error($q$select public.chicken_start(10, 'insane')$q$, '%Daredevil%');
end $$;

do $$
declare r jsonb; i int; before numeric; staked numeric := 0; back numeric := 0; f jsonb;
begin
  before := (public.get_portfolio() ->> 'cash')::numeric;
  for i in 1..30 loop
    perform pg_temp.clear_limits();
    r := public.mines_auto(5, 5, array[0, 1, 2]);
    back := back + (r -> 'round' -> 'result' ->> 'payout')::numeric;
    if (r -> 'round' -> 'result' ->> 'win')::boolean and (r -> 'round' -> 'result' ->> 'multiplier')::numeric <> 1.99 then
      raise exception 'mines auto paid %', r -> 'round' -> 'result';
    end if;
    r := public.chicken_auto(5, 'hard', 3);
    back := back + (r -> 'round' -> 'result' ->> 'payout')::numeric;
    if (r -> 'round' -> 'result' ->> 'win')::boolean and ((r -> 'round' -> 'result' ->> 'multiplier')::numeric <> 1.91 or (r -> 'round' ->> 'lane')::int <> 3) then
      raise exception 'chicken auto paid %', r -> 'round' -> 'result';
    end if;
    staked := staked + 10;
  end loop;
  perform pg_temp.ok((public.get_portfolio() ->> 'cash')::numeric = before - staked + back,
    format('60 auto rounds balance to the cent (staked %s, returned %s)', staked, back));
  perform pg_temp.expect_error($q$select public.mines_auto(5, 5, array[1, 1])$q$, '%different tiles%');
  perform pg_temp.expect_error($q$select public.chicken_auto(5, 'hard', 23)$q$, '%from 1 to 22%');

  f := public.fair_rotate('lucky-7');
  perform pg_temp.ok(f -> 'previous' ->> 'serverSeed' = repeat('b', 64) and (f -> 'previous' ->> 'nonce')::int = 64
    and f ->> 'clientSeed' = 'lucky-7' and (f ->> 'nonce')::int = 0 and f ->> 'serverSeedHash' <> f -> 'previous' ->> 'serverSeedHash',
    'rotating reveals the old server seed (64 bets) and starts a fresh pair');
  perform pg_temp.expect_error($q$select public.fair_rotate('has space')$q$, '%no spaces%');
end $$;

-- Rate limits ----------------------------------------------------------------
do $$ declare i int; begin
  perform pg_temp.clear_limits();
  for i in 1..40 loop perform public.play_plinko(1, 8, 'low', 1); end loop;
  perform pg_temp.expect_error($q$select public.play_plinko(1, 8, 'low', 1)$q$, '%Slow down%');
  perform pg_temp.ok(true, 'game plays are limited to 40 a minute');
  perform pg_temp.clear_limits();
end $$;

-- Portfolio JSON and the leaderboard -----------------------------------------
select pg_temp.ok((public.get_portfolio() -> 'games' ->> 'runRounds')::int = 300 + 25 + 5 + 150 + 2 + 2 + 60 + 40, 'every game round is recorded');
select pg_temp.ok((public.get_portfolio() -> 'games' -> 'stats' -> 'blackjack' ->> 'rounds')::int = 155, 'per-game stats');
select pg_temp.ok(jsonb_array_length(public.leaderboard()) = 2, 'the leaderboard lists every player');
select pg_temp.ok((select (r ->> 'pnl')::numeric = (r ->> 'marketPnl')::numeric + (r -> 'games' ->> 'net')::numeric
  from jsonb_array_elements(public.leaderboard()) r where r ->> 'name' = 'alice'), 'markets PnL plus games net equals total PnL');
select pg_temp.ok((select (r ->> 'netWorth')::numeric from jsonb_array_elements(public.leaderboard()) r where r ->> 'name' = 'alice')
  = (public.get_portfolio() ->> 'cash')::numeric + 42, 'net worth counts cash plus open positions (an unpriced parlay at cost)');

-- Reset ---------------------------------------------------------------------
select pg_temp.ok((public.reset_balance() ->> 'cash')::numeric = 50000, 'reset starts a $50,000 run');
select pg_temp.ok((public.get_portfolio() ->> 'run')::int = 2 and public.get_portfolio() -> 'positions' = '{}', 'reset clears positions and bumps the run');
select pg_temp.ok((public.get_portfolio() -> 'games' ->> 'runRounds')::int = 0, 'game totals restart with the run');

-- The activity feed is public -------------------------------------------------
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.ok((select count(*) from public.activity where kind = 'buy') = 3, 'anyone can read the activity feed');
select pg_temp.ok((select count(*) from public.portfolios) = 0, 'guests can''t read portfolios');
select pg_temp.expect_error($$select public.buy('123', 'yes', 10, 0.5)$$, '%permission denied%');
select pg_temp.ok(public.username_available('carol') and not public.username_available('Alice'), 'username availability is case-insensitive');

-- Recovery codes --------------------------------------------------------------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'bob', false);
select public.create_recovery_code() as code \gset
select pg_temp.ok(:'code' ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$', 'recovery codes look like XXXX-XXXX-XXXX');
reset role;
set role anon;
select pg_temp.ok(public.reset_password_with_code('bob@example.com', :'code', 'short') ->> 'error' like '%8 to 72%', 'new passwords need 8 to 72 characters');
select public.reset_password_with_code('bob@example.com', lower(replace(:'code', '-', ' ')), 'brand new password') ->> 'code' as code2 \gset
reset role;
select pg_temp.ok((select encrypted_password = extensions.crypt('brand new password', encrypted_password) from auth.users where id = :'bob'),
  'a recovery code sets a new bcrypt password (and is typed case- and dash-insensitively)');
set role anon;
select pg_temp.ok(public.reset_password_with_code('bob@example.com', :'code', 'another password') ->> 'error' like '%don''t match%', 'a used code stops working');
select pg_temp.ok(public.reset_password_with_code('nobody@example.com', 'AAAA-BBBB-CCCC', 'another password') ->> 'error' like '%don''t match%',
  'unknown accounts get the same message');
do $$ declare i int; begin
  for i in 1..4 loop perform public.reset_password_with_code('bob@example.com', 'AAAA-BBBB-CCCC', 'another password'); end loop;
end $$;
select pg_temp.ok(public.reset_password_with_code('bob@example.com', :'code2', 'another password') ->> 'error' like '%Too many%',
  'five wrong codes lock recovery, even for the right code');
reset role;
select pg_temp.ok((select encrypted_password = extensions.crypt('brand new password', encrypted_password) from auth.users where id = :'bob'),
  'the locked attempt did not change the password');

\echo 'all database tests passed'
