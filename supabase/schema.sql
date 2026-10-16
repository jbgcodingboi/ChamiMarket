-- Chami Market backend for Supabase.
--
-- Paste this whole file into the Supabase SQL editor and run it. It is safe to
-- run again after an update: tables are created if missing and functions are
-- replaced.
--
-- Security model: the browser can read public data (usernames, markets,
-- results, the activity feed, the leaderboard) and its own portfolio, but it
-- cannot write any table. Every change to money goes through the functions
-- below, which run on the server, price trades from the server's own data,
-- roll game outcomes with a cryptographic RNG and lock the account row, so
-- balances can't be edited from devtools.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
-- Optional: lets trades read live Polymarket prices. Without it, trades use
-- the prices the sync job stores every few minutes.
do $$ begin
  create extension if not exists http with schema extensions;
exception when others then raise notice 'http extension not available; trades will use synced prices';
end $$;

create schema if not exists private;
revoke all on schema private from public;
-- Older versions returned text.
drop function if exists public.reset_password_with_code(text, text, text);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique check (username ~ '^[A-Za-z0-9_.+-]{1,20}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.portfolios (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  cash numeric(16, 2) not null check (cash >= 0),
  realized_pnl numeric(16, 2) not null default 0,
  run int not null default 1,
  run_start_cash numeric(16, 2) not null,
  resets_used int not null default 0,
  trade_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.positions (
  user_id uuid not null references public.portfolios (user_id) on delete cascade,
  market_id text not null,
  side text not null check (side in ('yes', 'no')),
  market_title text not null default '',
  shares numeric(18, 4) not null check (shares > 0),
  cost_basis numeric(16, 2) not null check (cost_basis >= 0),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, market_id, side)
);
create index if not exists positions_market_idx on public.positions (market_id);

create table if not exists public.history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.portfolios (user_id) on delete cascade,
  run int not null,
  type text not null check (type in ('buy', 'sell', 'settlement', 'reset')),
  market_id text,
  market_title text,
  side text,
  shares numeric(18, 4),
  price numeric(10, 4),
  amount numeric(16, 2),
  realized_pnl numeric(16, 2),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists history_user_idx on public.history (user_id, created_at desc);

create table if not exists public.game_rounds (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.portfolios (user_id) on delete cascade,
  run int not null,
  game text not null check (game in ('roulette', 'blackjack', 'plinko')),
  staked numeric(16, 2) not null,
  returned numeric(16, 2) not null,
  net numeric(16, 2) not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
alter table public.game_rounds drop constraint if exists game_rounds_game_check;
alter table public.game_rounds add constraint game_rounds_game_check
  check (game in ('roulette', 'blackjack', 'plinko', 'dice', 'mines', 'chicken'));
create index if not exists game_rounds_user_idx on public.game_rounds (user_id, created_at desc);

create table if not exists public.equity_snapshots (
  user_id uuid not null references public.portfolios (user_id) on delete cascade,
  t timestamptz not null default now(),
  equity numeric(16, 2) not null
);
create index if not exists equity_snapshots_user_idx on public.equity_snapshots (user_id, t desc);

-- Blackjack hands in progress, including the shoe. Never readable by clients.
create table if not exists public.blackjack_tables (
  user_id uuid primary key references public.portfolios (user_id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Provably fair seeds per player. The active server seed is secret until rotated.
create table if not exists public.fair_seeds (
  user_id uuid primary key references public.portfolios (user_id) on delete cascade,
  server_seed text not null,
  client_seed text not null,
  nonce int not null default 0,
  prev_server_seed text,
  prev_client_seed text,
  prev_nonce int,
  updated_at timestamptz not null default now()
);

-- Mines and Chicken Cross rounds in progress (mine positions and the crash lane stay here).
create table if not exists public.game_states (
  user_id uuid not null references public.portfolios (user_id) on delete cascade,
  game text not null check (game in ('mines', 'chicken')),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

create table if not exists public.recovery_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

-- Prices and closing times, written by the sync job (and by live price checks).
create table if not exists public.markets (
  id text primary key,
  title text not null,
  category text not null,
  league text,
  labels jsonb not null default '{"yes":"Yes","no":"No"}',
  yes_price numeric(10, 4) not null check (yes_price between 0 and 1),
  no_price numeric(10, 4) not null check (no_price between 0 and 1),
  end_date timestamptz,
  game_start timestamptz,
  closed boolean not null default false,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists markets_category_idx on public.markets (category, end_date);

create table if not exists public.resolutions (
  market_id text primary key,
  outcome text not null check (outcome in ('yes', 'no', 'void')),
  source text not null default 'sync',
  title text not null default '',
  resolved_at timestamptz not null default now()
);

-- The public activity feed: trades and game results from every player.
create table if not exists public.activity (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  username text not null,
  kind text not null check (kind in ('buy', 'sell', 'game')),
  market_id text,
  market_title text,
  side text,
  side_label text,
  shares numeric(18, 4),
  price numeric(10, 4),
  amount numeric(16, 2),
  game text,
  net numeric(16, 2),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists activity_created_idx on public.activity (created_at desc);

create table if not exists private.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null,
  primary key (user_id, bucket)
);

-- ---------------------------------------------------------------------------
-- Row level security: read-only access for clients, no client writes at all
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.positions enable row level security;
alter table public.history enable row level security;
alter table public.game_rounds enable row level security;
alter table public.equity_snapshots enable row level security;
alter table public.blackjack_tables enable row level security;
alter table public.fair_seeds enable row level security;
alter table public.game_states enable row level security;
alter table public.recovery_codes enable row level security;
alter table public.markets enable row level security;
alter table public.resolutions enable row level security;
alter table public.activity enable row level security;

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on public.blackjack_tables, public.recovery_codes, public.fair_seeds, public.game_states from anon, authenticated;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "own portfolio" on public.portfolios;
create policy "own portfolio" on public.portfolios for select to authenticated using (user_id = auth.uid());
drop policy if exists "own positions" on public.positions;
create policy "own positions" on public.positions for select to authenticated using (user_id = auth.uid());
drop policy if exists "own history" on public.history;
create policy "own history" on public.history for select to authenticated using (user_id = auth.uid());
drop policy if exists "own game rounds" on public.game_rounds;
create policy "own game rounds" on public.game_rounds for select to authenticated using (user_id = auth.uid());
drop policy if exists "own snapshots" on public.equity_snapshots;
create policy "own snapshots" on public.equity_snapshots for select to authenticated using (user_id = auth.uid());
drop policy if exists "markets are public" on public.markets;
create policy "markets are public" on public.markets for select using (true);
drop policy if exists "results are public" on public.resolutions;
create policy "results are public" on public.resolutions for select using (true);
drop policy if exists "activity is public" on public.activity;
create policy "activity is public" on public.activity for select using (true);

-- Live feed over Supabase Realtime.
do $$ begin
  alter publication supabase_realtime add table public.activity;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers (private schema, not callable from the browser)
-- ---------------------------------------------------------------------------

create or replace function private.uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'Log in first.'; end if;
  return v;
end $$;

create or replace function private.ms(t timestamptz) returns bigint
language sql immutable set search_path = '' as $$ select (extract(epoch from t) * 1000)::bigint $$;

/** Fails when a user calls a bucket more than `max_hits` times per minute. */
create or replace function private.rate_limit(p_user uuid, p_bucket text, p_max int) returns void
language plpgsql set search_path = '' as $$
declare r private.rate_limits;
begin
  insert into private.rate_limits as rl (user_id, bucket, window_start, hits) values (p_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update set
    hits = case when rl.window_start < now() - interval '1 minute' then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start < now() - interval '1 minute' then now() else rl.window_start end
  returning * into r;
  if r.hits > p_max then raise exception 'Slow down a little and try again in a minute.'; end if;
end $$;

/** Uniform integer in [0, n) from a cryptographic RNG, without modulo bias. */
create or replace function private.rand_int(n int) returns int
language plpgsql volatile set search_path = '' as $$
declare x bigint; lim bigint;
begin
  if n < 1 then raise exception 'rand_int needs n >= 1'; end if;
  lim := (4294967296 / n) * n;
  loop
    x := ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint;
    if x < 0 then x := x + 4294967296; end if;
    exit when x < lim;
  end loop;
  return (x % n)::int;
end $$;

create or replace function private.username_of(p_user uuid) returns text
language sql stable set search_path = '' as $$ select username::text from public.profiles where id = p_user $$;

-- ---------------------------------------------------------------------------
-- Market prices
-- ---------------------------------------------------------------------------

/** Live Polymarket price via the http extension; null when unavailable. */
create or replace function private.live_gamma(p_id text) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare v_status int; v_body text; j jsonb; prices jsonb; y numeric; n numeric;
begin
  if p_id !~ '^\d{1,15}$' then return null; end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '4000');
    select status, content into v_status, v_body from extensions.http_get('https://gamma-api.polymarket.com/markets/' || p_id);
  exception when others then
    return null;
  end;
  if v_status is distinct from 200 then return null; end if;
  begin
    j := v_body::jsonb;
    prices := (j ->> 'outcomePrices')::jsonb;
    y := (prices ->> 0)::numeric;
    n := (prices ->> 1)::numeric;
  exception when others then
    return null;
  end;
  if y is null or n is null or y < 0 or y > 1 or n < 0 or n > 1 then return null; end if;
  return jsonb_build_object(
    'yes', round(y, 4), 'no', round(n, 4),
    'closed', coalesce((j ->> 'closed')::boolean, false),
    'end_date', j ->> 'endDate',
    'title', left(coalesce(j ->> 'question', ''), 300),
    'outcome', case
      when coalesce((j ->> 'closed')::boolean, false) and y >= 0.99 and n <= 0.01 then 'yes'
      when coalesce((j ->> 'closed')::boolean, false) and n >= 0.99 and y <= 0.01 then 'no'
    end
  );
end $$;

/**
 * The server's price for one outcome, with the market's title and closing
 * time. Raises when the market can't be traded right now.
 */
create or replace function private.quote(p_market text, p_side text, out price numeric, out title text, out closes timestamptz)
language plpgsql volatile set search_path = '' as $$
declare m public.markets; live jsonb; legs text[]; leg text; leg_id text; leg_side text; lp numeric; lt text; lc timestamptz; max_age interval;
begin
  if p_side not in ('yes', 'no') then raise exception 'Pick Yes or No.'; end if;
  if exists (select 1 from public.resolutions where market_id = p_market) then
    raise exception 'This market is resolved. Trading is closed.';
  end if;

  -- Parlays are priced from their legs ("q-parlay-<id>_y~<id>_n").
  if p_market like 'q-parlay-%' then
    legs := string_to_array(substr(p_market, 10), '~');
    if coalesce(array_length(legs, 1), 0) < 2 then raise exception 'This market is not available for trading right now.'; end if;
    price := 1;
    closes := null;
    foreach leg in array legs loop
      leg_id := regexp_replace(leg, '_[yn]$', '');
      leg_side := case when leg ~ '_y$' then 'yes' else 'no' end;
      select q.price, q.title, q.closes into lp, lt, lc from private.quote(leg_id, leg_side) q;
      price := price * lp;
      select least(coalesce(mm.game_start, mm.end_date), lc) into lc from public.markets mm where mm.id = leg_id;
      closes := least(coalesce(closes, lc), lc);
    end loop;
    if p_side = 'no' then price := 1 - price; end if;
    price := round(price, 4);
    select coalesce(mm.title, 'Parlay') into title from public.markets mm where mm.id = p_market;
    title := coalesce(title, 'Parlay');
  else
    select * into m from public.markets where id = p_market;
    -- Live prices only for markets the sync job knows about, and at most every
    -- 20 seconds per market, so failed or spammed trades can't flood the API.
    if p_market ~ '^\d+$' and m.id is not null and m.updated_at < now() - interval '20 seconds' then
      live := private.live_gamma(p_market);
    end if;
    if live is not null then
      if (live ->> 'closed')::boolean then raise exception 'This market is closed.'; end if;
      price := (live ->> case when p_side = 'yes' then 'yes' else 'no' end)::numeric;
      title := coalesce(nullif(live ->> 'title', ''), m.title, '');
      closes := coalesce(m.end_date, (live ->> 'end_date')::timestamptz);
      update public.markets set yes_price = (live ->> 'yes')::numeric, no_price = (live ->> 'no')::numeric, updated_at = now() where id = p_market;
    else
      if m.id is null then raise exception 'This market is not available for trading right now.'; end if;
      -- Hourly crypto markets move fast, so their synced price expires sooner.
      max_age := case when p_market ~ '^q-[a-z]+-above-' then interval '12 minutes' else interval '3 hours' end;
      if m.updated_at < now() - max_age then
        raise exception 'This market''s price is refreshing. Try again in a few minutes.';
      end if;
      if m.closed then raise exception 'This market is closed.'; end if;
      price := case when p_side = 'yes' then m.yes_price else m.no_price end;
      title := m.title;
      closes := m.end_date;
    end if;
  end if;

  if closes is not null and closes <= now() then
    raise exception 'This event has ended. Trading is closed until it settles.';
  end if;
  if price is null or price <= 0 or price >= 1 then
    raise exception 'This outcome has no tradable price right now.';
  end if;
end $$;

/** Rejects a trade when the price the player saw is more than 3 cents off the server's. */
create or replace function private.check_price(p_seen numeric, p_server numeric) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_seen is not null and abs(p_seen - p_server) > 0.03 then
    raise exception 'The price moved to %¢. Check the new price and try again.', round(p_server * 100, 1);
  end if;
end $$;

/** A position's value: resolved markets pay $1 or $0 (void refunds cost), else the stored price. */
create or replace function private.position_value(p public.positions) returns numeric
language sql stable set search_path = '' as $$
  select round(case
    when r.outcome = 'void' then p.cost_basis
    when r.outcome is not null then case when r.outcome = p.side then p.shares else 0 end
    when m.id is not null then p.shares * case when p.side = 'yes' then m.yes_price else m.no_price end
    else p.cost_basis
  end, 2)
  from (select 1) one
  left join public.resolutions r on r.market_id = p.market_id
  left join public.markets m on m.id = p.market_id
$$;

create or replace function private.equity(p_user uuid) returns numeric
language sql stable set search_path = '' as $$
  select pf.cash + coalesce((select sum(private.position_value(p)) from public.positions p where p.user_id = p_user), 0)
  from public.portfolios pf where pf.user_id = p_user
$$;

create or replace function private.snapshot(p_user uuid, p_force boolean default false) returns void
language plpgsql set search_path = '' as $$
declare last timestamptz;
begin
  select max(t) into last from public.equity_snapshots where user_id = p_user;
  if p_force or last is null or last < now() - interval '5 minutes' then
    insert into public.equity_snapshots (user_id, equity) values (p_user, private.equity(p_user));
    delete from public.equity_snapshots s where s.user_id = p_user and s.t < (
      select t from public.equity_snapshots where user_id = p_user order by t desc offset 399 limit 1
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Portfolio view returned to the browser (same shape as the local app uses)
-- ---------------------------------------------------------------------------

create or replace function private.portfolio_json(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  with pf as (select * from public.portfolios where user_id = p_user),
  stats as (
    select game, count(*) as rounds, sum(staked) as wagered, sum(net) as net, greatest(max(net), 0) as best
    from public.game_rounds where user_id = p_user group by game
  ),
  run_games as (
    select count(*) as rounds, coalesce(sum(net), 0) as net, coalesce(sum(staked), 0) as wagered, greatest(coalesce(max(net), 0), 0) as best
    from public.game_rounds g, pf where g.user_id = p_user and g.run = pf.run
  )
  select jsonb_build_object(
    'cash', pf.cash,
    'realizedPnl', pf.realized_pnl,
    'run', pf.run,
    'runStartCash', pf.run_start_cash,
    'resetsUsed', pf.resets_used,
    'tradeCount', pf.trade_count,
    'createdAt', private.ms(pf.created_at),
    'positions', coalesce((
      select jsonb_object_agg(p.market_id || ':' || p.side, jsonb_build_object(
        'marketId', p.market_id, 'side', p.side, 'marketTitle', p.market_title,
        'shares', p.shares, 'costBasis', p.cost_basis,
        'openedAt', private.ms(p.opened_at), 'updatedAt', private.ms(p.updated_at)))
      from public.positions p where p.user_id = p_user), '{}'),
    'history', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', 'h' || h.id, 'ts', private.ms(h.created_at), 'run', h.run, 'type', h.type,
        'marketId', h.market_id, 'marketTitle', h.market_title, 'side', h.side, 'shares', h.shares,
        'price', h.price, 'amount', h.amount, 'realizedPnl', h.realized_pnl, 'note', h.note)) order by h.created_at desc, h.id desc)
      from (select * from public.history where user_id = p_user order by created_at desc, id desc limit 1000) h), '[]'),
    'snapshots', coalesce((
      select jsonb_agg(jsonb_build_object('t', private.ms(s.t), 'equity', s.equity) order by s.t)
      from public.equity_snapshots s where s.user_id = p_user), '[]'),
    'games', jsonb_build_object(
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', 'g' || g.id, 'ts', private.ms(g.created_at), 'run', g.run, 'game', g.game,
          'staked', g.staked, 'returned', g.returned, 'net', g.net, 'detail', g.detail) order by g.created_at desc, g.id desc)
        from (select * from public.game_rounds where user_id = p_user order by created_at desc, id desc limit 200) g), '[]'),
      'stats', coalesce((select jsonb_object_agg(game, jsonb_build_object('rounds', rounds, 'wagered', wagered, 'net', net, 'best', best)) from stats), '{}'),
      'pending', '[]'::jsonb,
      'run', pf.run,
      'runNet', rg.net, 'runRounds', rg.rounds, 'runWagered', rg.wagered, 'runBest', rg.best)
  )
  from pf, run_games rg
$$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

/** Creates the profile and a $100,000 portfolio for every new sign-up. */
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if v_name !~ '^[A-Za-z0-9_.+-]{1,20}$' then
    raise exception 'Pick a username of up to 20 letters, numbers or underscores.';
  end if;
  insert into public.profiles (id, username) values (new.id, v_name);
  insert into public.portfolios (user_id, cash, run_start_cash) values (new.id, 100000, 100000);
  insert into public.equity_snapshots (user_id, equity) values (new.id, 100000);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where lower(username::text) = lower(trim(p_username)))
$$;

create or replace function public.get_portfolio() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid();
begin
  perform private.snapshot(v_user);
  return private.portfolio_json(v_user) || jsonb_build_object('username', private.username_of(v_user));
end $$;

/** A new one-time recovery code for the signed-in player. Shown once; only a hash is stored. */
create or replace function public.create_recovery_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text := ''; i int;
begin
  perform private.rate_limit(v_user, 'recovery', 5);
  for i in 1..12 loop
    code := code || substr(alphabet, private.rand_int(length(alphabet)) + 1, 1);
    if i in (4, 8) then code := code || '-'; end if;
  end loop;
  insert into public.recovery_codes (user_id, code_hash) values (v_user, extensions.crypt(code, extensions.gen_salt('bf', 10)))
  on conflict (user_id) do update set code_hash = excluded.code_hash, failed_attempts = 0, locked_until = null, created_at = now();
  return code;
end $$;

/**
 * Sets a new password with a recovery code (no email involved). Five wrong
 * codes lock the account's recovery for 15 minutes. Returns { "code": "<new
 * code>" } on success (the used code stops working) or { "error": "..." }.
 * Failures are returned rather than raised so the attempt counter is saved.
 */
create or replace function public.reset_password_with_code(p_email text, p_code text, p_new_password text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid; rc public.recovery_codes; v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; fresh text := ''; i int;
  no_match constant text := 'That username and recovery code don''t match.';
begin
  if length(coalesce(p_new_password, '')) < 8 or length(p_new_password) > 72 then
    return jsonb_build_object('error', 'Passwords need 8 to 72 characters.');
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is not null then
    select * into rc from public.recovery_codes where user_id = v_user for update;
  end if;
  if rc.user_id is null then
    perform extensions.crypt('timing', extensions.gen_salt('bf', 10));
    return jsonb_build_object('error', no_match);
  end if;
  if rc.locked_until is not null and rc.locked_until > now() then
    return jsonb_build_object('error', 'Too many wrong codes. Try again in 15 minutes.');
  end if;
  v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
  if extensions.crypt(v_code, rc.code_hash) <> rc.code_hash then
    update public.recovery_codes set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' end
    where user_id = v_user;
    return jsonb_build_object('error', no_match);
  end if;

  update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)), updated_at = now()
  where id = v_user;
  -- Sign out every existing session.
  begin
    delete from auth.sessions where user_id = v_user;
  exception when others then null;
  end;
  begin
    execute 'update auth.refresh_tokens set revoked = true where user_id = $1' using v_user::text;
  exception when others then null;
  end;

  for i in 1..12 loop
    fresh := fresh || substr(alphabet, private.rand_int(length(alphabet)) + 1, 1);
    if i in (4, 8) then fresh := fresh || '-'; end if;
  end loop;
  update public.recovery_codes set code_hash = extensions.crypt(fresh, extensions.gen_salt('bf', 10)), failed_attempts = 0, locked_until = null, created_at = now()
  where user_id = v_user;
  return jsonb_build_object('code', fresh);
end $$;

-- ---------------------------------------------------------------------------
-- Trading
-- ---------------------------------------------------------------------------

create or replace function public.buy(p_market_id text, p_side text, p_amount numeric, p_seen_price numeric default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); pf public.portfolios; q record; spend numeric; v_shares numeric; label text;
begin
  perform private.rate_limit(v_user, 'trade', 30);
  if not (p_amount >= 0.01 and p_amount < 1e12) then raise exception 'Enter an amount of at least $0.01.'; end if;
  -- Parlays are no longer offered. Positions opened earlier can still be sold and settle as before.
  if p_market_id like 'q-parlay-%' then raise exception 'Parlays are no longer offered.'; end if;
  select * into pf from public.portfolios where user_id = v_user for update;
  select * into q from private.quote(p_market_id, p_side);
  perform private.check_price(p_seen_price, q.price);
  spend := round(p_amount, 2);
  if spend > pf.cash then raise exception 'Amount exceeds your available cash ($%).', to_char(pf.cash, 'FM999,999,999,990.00'); end if;
  v_shares := round(spend / q.price, 4);
  if v_shares < 0.0001 then raise exception 'Order is too small to buy any shares.'; end if;

  insert into public.positions as p (user_id, market_id, side, market_title, shares, cost_basis)
  values (v_user, p_market_id, p_side, q.title, v_shares, spend)
  on conflict (user_id, market_id, side) do update set
    shares = p.shares + excluded.shares, cost_basis = p.cost_basis + excluded.cost_basis,
    market_title = excluded.market_title, updated_at = now();
  update public.portfolios set cash = cash - spend, trade_count = trade_count + 1, updated_at = now() where user_id = v_user;
  insert into public.history (user_id, run, type, market_id, market_title, side, shares, price, amount)
  values (v_user, pf.run, 'buy', p_market_id, q.title, p_side, v_shares, q.price, spend);
  select labels ->> p_side into label from public.markets where id = p_market_id;
  insert into public.activity (user_id, username, kind, market_id, market_title, side, side_label, shares, price, amount)
  values (v_user, private.username_of(v_user), 'buy', p_market_id, q.title, p_side, coalesce(label, initcap(p_side)), v_shares, q.price, spend);
  perform private.snapshot(v_user, true);
  return jsonb_build_object('price', q.price, 'shares', v_shares, 'amount', spend, 'portfolio', private.portfolio_json(v_user));
end $$;

create or replace function public.sell(p_market_id text, p_side text, p_shares numeric, p_seen_price numeric default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); pf public.portfolios; pos public.positions; q record; qty numeric; sold numeric;
  proceeds numeric; cost_part numeric; pnl numeric; full_sale boolean; label text;
begin
  perform private.rate_limit(v_user, 'trade', 30);
  if not (p_shares > 0 and p_shares < 1e12) then raise exception 'Enter a number of shares greater than 0.'; end if;
  select * into pf from public.portfolios where user_id = v_user for update;
  select * into pos from public.positions where user_id = v_user and market_id = p_market_id and side = p_side for update;
  if pos.user_id is null then raise exception 'You have no shares to sell.'; end if;
  if exists (select 1 from public.resolutions where market_id = p_market_id) then
    raise exception 'This market is resolved. Positions settle automatically.';
  end if;
  select * into q from private.quote(p_market_id, p_side);
  perform private.check_price(p_seen_price, q.price);
  qty := round(p_shares, 4);
  if qty > pos.shares then raise exception 'You only own % shares.', pos.shares; end if;
  full_sale := pos.shares - qty < 0.0001;
  sold := case when full_sale then pos.shares else qty end;
  proceeds := round(sold * q.price, 2);
  cost_part := case when full_sale then pos.cost_basis else round(sold * pos.cost_basis / pos.shares, 2) end;
  pnl := proceeds - cost_part;
  if not full_sale and proceeds < 0.01 then raise exception 'Sale is too small to produce any proceeds.'; end if;

  if full_sale then
    delete from public.positions where user_id = v_user and market_id = p_market_id and side = p_side;
  else
    update public.positions set shares = shares - sold, cost_basis = cost_basis - cost_part, updated_at = now()
    where user_id = v_user and market_id = p_market_id and side = p_side;
  end if;
  update public.portfolios set cash = cash + proceeds, realized_pnl = realized_pnl + pnl, trade_count = trade_count + 1, updated_at = now()
  where user_id = v_user;
  insert into public.history (user_id, run, type, market_id, market_title, side, shares, price, amount, realized_pnl)
  values (v_user, pf.run, 'sell', p_market_id, pos.market_title, p_side, sold, q.price, proceeds, pnl);
  select labels ->> p_side into label from public.markets where id = p_market_id;
  insert into public.activity (user_id, username, kind, market_id, market_title, side, side_label, shares, price, amount)
  values (v_user, private.username_of(v_user), 'sell', p_market_id, pos.market_title, p_side, coalesce(label, initcap(p_side)), sold, q.price, proceeds);
  perform private.snapshot(v_user, true);
  return jsonb_build_object('price', q.price, 'shares', sold, 'proceeds', proceeds, 'realizedPnl', pnl, 'isFull', full_sale,
    'portfolio', private.portfolio_json(v_user));
end $$;

/** Starts a new run at $50,000: open positions and any blackjack hand are cleared. */
create or replace function public.reset_balance() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); pf public.portfolios; cleared int;
begin
  select * into pf from public.portfolios where user_id = v_user for update;
  select count(*) into cleared from public.positions where user_id = v_user;
  delete from public.positions where user_id = v_user;
  delete from public.blackjack_tables where user_id = v_user;
  delete from public.game_states where user_id = v_user;
  insert into public.history (user_id, run, type, amount, note) values (v_user, pf.run, 'reset', 50000,
    format('Balance reset to $50,000.00. %s open position%s cleared.', cleared, case when cleared = 1 then '' else 's' end));
  update public.portfolios set cash = 50000, realized_pnl = 0, run = run + 1, run_start_cash = 50000,
    resets_used = resets_used + 1, updated_at = now() where user_id = v_user;
  delete from public.equity_snapshots where user_id = v_user;
  insert into public.equity_snapshots (user_id, equity) values (v_user, 50000);
  return private.portfolio_json(v_user);
end $$;

/**
 * Deletes the caller's account for good once the password checks out:
 * profile, portfolio, positions, history, game rounds and state, seeds,
 * recovery codes, snapshots and feed entries all go with it (they cascade
 * from auth.users). A wrong password comes back as {error}, not a raise.
 */
create or replace function public.delete_account(p_password text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); v_ok boolean;
begin
  perform private.rate_limit(v_user, 'delete', 5);
  select u.encrypted_password is not null and u.encrypted_password = extensions.crypt(coalesce(p_password, ''), u.encrypted_password)
    into v_ok from auth.users u where u.id = v_user;
  if not coalesce(v_ok, false) then return jsonb_build_object('error', 'That password is not right.'); end if;
  delete from private.rate_limits where user_id = v_user;
  delete from auth.users where id = v_user;
  return jsonb_build_object('deleted', true);
end $$;

/** Pays out every holder of a resolved market. Returns how many positions settled. */
create or replace function private.settle_market(p_market text, p_outcome text) returns int
language plpgsql volatile set search_path = '' as $$
declare u uuid; pos public.positions; pf public.portfolios; payout numeric; pnl numeric; n int := 0;
begin
  for u in select distinct user_id from public.positions where market_id = p_market order by user_id loop
    select * into pf from public.portfolios where user_id = u for update;
    for pos in select * from public.positions where user_id = u and market_id = p_market for update loop
      payout := case when p_outcome = 'void' then pos.cost_basis when pos.side = p_outcome then round(pos.shares, 2) else 0 end;
      pnl := case when p_outcome = 'void' then 0 else payout - pos.cost_basis end;
      update public.portfolios set cash = cash + payout, realized_pnl = realized_pnl + pnl, updated_at = now() where user_id = u;
      insert into public.history (user_id, run, type, market_id, market_title, side, shares, price, amount, realized_pnl, note)
      values (u, pf.run, 'settlement', p_market, pos.market_title, pos.side, pos.shares,
        case when p_outcome = 'void' then round(pos.cost_basis / pos.shares, 4) when pos.side = p_outcome then 1 else 0 end,
        payout, pnl,
        case when p_outcome = 'void' then 'Voided, refunded at cost' when p_outcome = 'yes' then 'Resolved Yes' else 'Resolved No' end);
      delete from public.positions where user_id = u and market_id = pos.market_id and side = pos.side;
      n := n + 1;
    end loop;
    perform private.snapshot(u, true);
  end loop;
  return n;
end $$;

create or replace function private.resolve(p_market text, p_outcome text, p_source text, p_title text) returns int
language plpgsql volatile set search_path = '' as $$
begin
  if p_outcome not in ('yes', 'no', 'void') then return 0; end if;
  insert into public.resolutions (market_id, outcome, source, title) values (p_market, p_outcome, p_source, coalesce(p_title, ''))
  on conflict (market_id) do nothing;
  if not found then return 0; end if;
  return private.settle_market(p_market, p_outcome);
end $$;

/** Lets a player trigger an immediate check of a Polymarket market they hold (settles it if closed). */
create or replace function public.check_market(p_market_id text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); live jsonb;
begin
  if exists (select 1 from public.resolutions where market_id = p_market_id) then return true; end if;
  if p_market_id !~ '^\d+$' or not exists (select 1 from public.positions where market_id = p_market_id) then return false; end if;
  perform private.rate_limit(v_user, 'check', 20);
  live := private.live_gamma(p_market_id);
  if live is null or live ->> 'outcome' is null then return false; end if;
  perform private.resolve(p_market_id, live ->> 'outcome', 'api', live ->> 'title');
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Games: shared money handling
-- ---------------------------------------------------------------------------

create or replace function private.game_round(p_user uuid, p_run int, p_game text, p_staked numeric, p_returned numeric, p_detail text) returns void
language plpgsql volatile set search_path = '' as $$
begin
  update public.portfolios set cash = cash + p_returned, updated_at = now() where user_id = p_user;
  insert into public.game_rounds (user_id, run, game, staked, returned, net, detail)
  values (p_user, p_run, p_game, p_staked, p_returned, p_returned - p_staked, p_detail);
end $$;

create or replace function private.game_activity(p_user uuid, p_game text, p_staked numeric, p_net numeric, p_detail text) returns void
language sql volatile set search_path = '' as $$
  insert into public.activity (user_id, username, kind, game, amount, net, detail)
  values (p_user, private.username_of(p_user), 'game', p_game, p_staked, p_net, p_detail)
$$;

-- ---------------------------------------------------------------------------
-- Roulette (European, single zero)
-- ---------------------------------------------------------------------------

create or replace function private.roulette_color(n int) returns text
language sql immutable set search_path = '' as $$
  select case when n = 0 then 'Green' when n = any (array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]) then 'Red' else 'Black' end
$$;

/** Numbers covered by a bet key ("split:17-20", "red:1-3-...") after checking it is a real bet. */
create or replace function private.roulette_bet(p_key text, out bet_type text, out nums int[], out odds int)
language plpgsql immutable set search_path = '' as $$
declare parts text[]; n int; c int; k int;
begin
  parts := string_to_array(p_key, ':');
  if array_length(parts, 1) <> 2 or parts[2] !~ '^\d{1,2}(-\d{1,2})*$' then raise exception 'Invalid bet.'; end if;
  bet_type := parts[1];
  nums := string_to_array(parts[2], '-')::int[];
  if exists (select 1 from unnest(nums) x where x < 0 or x > 36) then raise exception 'Invalid bet.'; end if;
  if nums <> (select array_agg(x order by x) from (select distinct unnest(nums) x) d) then raise exception 'Invalid bet.'; end if;
  n := array_length(nums, 1);
  c := nums[1];
  if bet_type = 'straight' and n = 1 then odds := 35;
  elsif bet_type = 'split' and n = 2 and (
      (c = 0 and nums[2] between 1 and 3) or
      (c >= 1 and nums[2] = c + 3) or
      (c >= 1 and nums[2] = c + 1 and c % 3 <> 0)) then odds := 17;
  elsif bet_type = 'street' and n = 3 and c % 3 = 1 and nums = array[c, c + 1, c + 2] then odds := 11;
  elsif bet_type = 'corner' and n = 4 and c >= 1 and c % 3 <> 0 and c <= 32 and nums = array[c, c + 1, c + 3, c + 4] then odds := 8;
  elsif bet_type = 'sixline' and n = 6 and c % 3 = 1 and c <= 31 and nums = (select array_agg(x) from generate_series(c, c + 5) x) then odds := 5;
  elsif bet_type = 'dozen' and n = 12 and c in (1, 13, 25) and nums = (select array_agg(x) from generate_series(c, c + 11) x) then odds := 2;
  elsif bet_type = 'column' and n = 12 and c between 1 and 3 and nums = (select array_agg(x) from generate_series(c, 36, 3) x) then odds := 2;
  elsif bet_type in ('red', 'black') and n = 18 and nums = (select array_agg(x order by x) from generate_series(1, 36) x where private.roulette_color(x) = initcap(bet_type)) then odds := 1;
  elsif bet_type = 'odd' and n = 18 and nums = (select array_agg(x) from generate_series(1, 35, 2) x) then odds := 1;
  elsif bet_type = 'even' and n = 18 and nums = (select array_agg(x) from generate_series(2, 36, 2) x) then odds := 1;
  elsif bet_type = 'low' and n = 18 and nums = (select array_agg(x) from generate_series(1, 18) x) then odds := 1;
  elsif bet_type = 'high' and n = 18 and nums = (select array_agg(x) from generate_series(19, 36) x) then odds := 1;
  else raise exception 'Invalid bet.';
  end if;
end $$;

/** p_bets: [{ "key": "straight:17", "amount": 25 }, ...]. */
create or replace function public.play_roulette(p_bets jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); pf public.portfolios; b jsonb; amt numeric; staked numeric := 0; returned numeric := 0;
  v_result int; bet record; nbets int;
begin
  perform private.rate_limit(v_user, 'game', 40);
  if jsonb_typeof(p_bets) <> 'array' then raise exception 'Invalid bets.'; end if;
  nbets := jsonb_array_length(p_bets);
  if nbets < 1 or nbets > 200 then raise exception 'Place between 1 and 200 bets.'; end if;
  select * into pf from public.portfolios where user_id = v_user for update;
  v_result := private.rand_int(37);
  for b in select * from jsonb_array_elements(p_bets) loop
    amt := round((b ->> 'amount')::numeric, 2);
    if not (amt >= 1 and amt <= 1e9) then raise exception 'Each bet must be at least $1.'; end if;
    select * into bet from private.roulette_bet(b ->> 'key');
    staked := staked + amt;
    if v_result = any (bet.nums) then returned := returned + amt * (bet.odds + 1); end if;
  end loop;
  if staked > pf.cash then raise exception 'Not enough cash for these bets.'; end if;
  update public.portfolios set cash = cash - staked where user_id = v_user;
  perform private.game_round(v_user, pf.run, 'roulette', staked, returned,
    format('%s %s · %s bet%s', v_result, private.roulette_color(v_result), nbets, case when nbets = 1 then '' else 's' end));
  perform private.game_activity(v_user, 'roulette', staked, returned - staked, format('landed %s %s', v_result, private.roulette_color(v_result)));
  return jsonb_build_object('result', v_result, 'staked', staked, 'returned', returned, 'portfolio', private.portfolio_json(v_user));
end $$;

-- ---------------------------------------------------------------------------
-- Plinko
-- ---------------------------------------------------------------------------

create or replace function private.plinko_table(p_rows int, p_risk text) returns numeric[]
language sql immutable set search_path = '' as $$
  select array_agg(x::numeric order by ord)
  from jsonb_array_elements_text('{
    "8":  {"low": [5.6,2.1,1.1,1,0.5,1,1.1,2.1,5.6], "medium": [13,3,1.3,0.7,0.4,0.7,1.3,3,13], "high": [29,4,1.5,0.3,0.2,0.3,1.5,4,29]},
    "12": {"low": [10,3,1.6,1.4,1.1,1,0.5,1,1.1,1.4,1.6,3,10], "medium": [33,11,4,2,1.1,0.6,0.3,0.6,1.1,2,4,11,33], "high": [170,24,8.1,2,0.7,0.2,0.2,0.2,0.7,2,8.1,24,170]},
    "16": {"low": [16,9,2,1.4,1.4,1.2,1.1,1,0.5,1,1.1,1.2,1.4,1.4,2,9,16], "medium": [110,41,10,5,3,1.5,1,0.5,0.3,0.5,1,1.5,3,5,10,41,110], "high": [1000,130,26,9,4,2,0.2,0.2,0.2,0.2,0.2,2,4,9,26,130,1000]}
  }'::jsonb -> p_rows::text -> p_risk) with ordinality as t(x, ord)
$$;

create or replace function public.play_plinko(p_amount numeric, p_rows int, p_risk text, p_balls int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); pf public.portfolios; amt numeric; mults numeric[]; total numeric; returned numeric := 0;
  i int; r int; k int; path int[]; m numeric; ret numeric; balls jsonb := '[]';
begin
  perform private.rate_limit(v_user, 'game', 40);
  if p_rows not in (8, 12, 16) or p_risk not in ('low', 'medium', 'high') then raise exception 'Pick 8, 12 or 16 rows and a risk level.'; end if;
  if p_balls is null or p_balls < 1 or p_balls > 25 then raise exception 'Drop between 1 and 25 balls.'; end if;
  amt := round(p_amount, 2);
  if not (amt >= 0.1 and amt <= 1e9) then raise exception 'Enter a bet of at least $0.10.'; end if;
  select * into pf from public.portfolios where user_id = v_user for update;
  total := amt * p_balls;
  if total > pf.cash then raise exception 'Not enough cash for % balls at $% each.', p_balls, amt; end if;
  update public.portfolios set cash = cash - total where user_id = v_user;
  mults := private.plinko_table(p_rows, p_risk);
  for i in 1..p_balls loop
    path := '{}';
    for r in 1..p_rows loop path := path || private.rand_int(2); end loop;
    k := (select sum(x) from unnest(path) x);
    m := mults[k + 1];
    ret := round(amt * m, 2);
    returned := returned + ret;
    perform private.game_round(v_user, pf.run, 'plinko', amt, ret, format('%s× · %s rows, %s risk', m, p_rows, p_risk));
    balls := balls || jsonb_build_object('path', to_jsonb(path), 'bucket', k, 'multiplier', m, 'returned', ret);
  end loop;
  perform private.game_activity(v_user, 'plinko', total, returned - total,
    format('dropped %s ball%s (%s rows, %s risk)', p_balls, case when p_balls = 1 then '' else 's' end, p_rows, p_risk));
  return jsonb_build_object('balls', balls, 'staked', total, 'returned', returned, 'portfolio', private.portfolio_json(v_user));
end $$;

-- ---------------------------------------------------------------------------
-- Blackjack: six decks, dealer stands on soft 17, peeks under an ace or ten,
-- blackjack pays 3:2, insurance 2:1, double on any two, split up to 4 hands.
-- The state (shoe included) stays on the server; players only see bj_view.
-- ---------------------------------------------------------------------------

create or replace function private.bj_rank_value(p_rank text) returns int
language sql immutable set search_path = '' as $$
  select case when p_rank = 'A' then 11 when p_rank in ('J', 'Q', 'K', '10') then 10 else p_rank::int end
$$;

create or replace function private.bj_value(p_cards jsonb, out total int, out soft boolean)
language plpgsql immutable set search_path = '' as $$
declare c jsonb; aces int := 0;
begin
  total := 0;
  for c in select * from jsonb_array_elements(coalesce(p_cards, '[]')) loop
    total := total + private.bj_rank_value(c ->> 'rank');
    if c ->> 'rank' = 'A' then aces := aces + 1; end if;
  end loop;
  while total > 21 and aces > 0 loop
    total := total - 10;
    aces := aces - 1;
  end loop;
  soft := aces > 0;
end $$;

create or replace function private.bj_is_blackjack(p_cards jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_array_length(coalesce(p_cards, '[]')) = 2 and (private.bj_value(p_cards)).total = 21
$$;

create or replace function private.bj_new_shoe() returns jsonb
language plpgsql volatile set search_path = '' as $$
declare cards text[] := '{}'; d int; su text; r text; i int; j int; tmp text;
begin
  for d in 0..5 loop
    foreach su in array array['♠', '♥', '♦', '♣'] loop
      foreach r in array array['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] loop
        cards := cards || (d || '|' || r || '|' || su);
      end loop;
    end loop;
  end loop;
  for i in reverse array_length(cards, 1)..2 loop
    j := private.rand_int(i) + 1;
    tmp := cards[i];
    cards[i] := cards[j];
    cards[j] := tmp;
  end loop;
  return (
    select jsonb_agg(jsonb_build_object('rank', split_part(c, '|', 2), 'suit', split_part(c, '|', 3),
      'id', split_part(c, '|', 1) || split_part(c, '|', 2) || split_part(c, '|', 3)) order by ord)
    from unnest(cards) with ordinality as u(c, ord)
  );
end $$;

/** Moves the top card of the shoe to the dealer (p_target = -1) or a hand. */
create or replace function private.bj_draw(s jsonb, p_target int) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare shoe jsonb := s -> 'shoe'; card jsonb;
begin
  if shoe is null or jsonb_array_length(shoe) = 0 then shoe := private.bj_new_shoe(); end if;
  card := shoe -> 0;
  s := jsonb_set(s, '{shoe}', shoe - 0);
  if p_target < 0 then
    return jsonb_set(s, '{dealer}', (s -> 'dealer') || jsonb_build_array(card));
  end if;
  return jsonb_set(s, array['hands', p_target::text, 'cards'], (s -> 'hands' -> p_target -> 'cards') || jsonb_build_array(card));
end $$;

create or replace function private.bj_hand(p_cards jsonb, p_bet numeric, p_from_split boolean, p_split_aces boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('cards', p_cards, 'bet', p_bet, 'fromSplit', p_from_split, 'splitAces', p_split_aces, 'doubled', false, 'done', false)
$$;

create or replace function private.bj_set_done(s jsonb, p_index int) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_set(s, array['hands', p_index::text, 'done'], 'true')
$$;

create or replace function private.bj_settle(s jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare dealer_total int := (private.bj_value(s -> 'dealer')).total; dealer_bj boolean := private.bj_is_blackjack(s -> 'dealer');
  h jsonb; hands jsonb := '[]'; v int; is_natural boolean; outcome text; back numeric; returned numeric := 0; staked numeric := 0;
  ins numeric := coalesce((s ->> 'insurance')::numeric, 0); ins_back numeric;
begin
  for h in select * from jsonb_array_elements(s -> 'hands') loop
    v := (private.bj_value(h -> 'cards')).total;
    is_natural := private.bj_is_blackjack(h -> 'cards') and not (h ->> 'fromSplit')::boolean;
    outcome := case
      when is_natural and not dealer_bj then 'blackjack'
      when is_natural and dealer_bj then 'push'
      when dealer_bj then 'lose'
      when v > 21 then 'bust'
      when dealer_total > 21 or v > dealer_total then 'win'
      when v = dealer_total then 'push'
      else 'lose' end;
    back := round(case outcome when 'blackjack' then (h ->> 'bet')::numeric * 2.5 when 'win' then (h ->> 'bet')::numeric * 2
      when 'push' then (h ->> 'bet')::numeric else 0 end, 2);
    returned := returned + back;
    staked := staked + (h ->> 'bet')::numeric;
    hands := hands || jsonb_build_array(h || jsonb_build_object('outcome', outcome, 'returned', back));
  end loop;
  ins_back := case when dealer_bj and ins > 0 then ins * 3 else 0 end;
  return s || jsonb_build_object('phase', 'done', 'hands', hands, 'result', jsonb_build_object(
    'returned', returned + ins_back, 'staked', staked + ins, 'insuranceBack', ins_back, 'dealerBlackjack', dealer_bj));
end $$;

create or replace function private.bj_after_peek(s jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare up text := s -> 'dealer' -> 0 ->> 'rank';
begin
  if (up = 'A' or private.bj_rank_value(up) = 10) and private.bj_is_blackjack(s -> 'dealer') then return private.bj_settle(s); end if;
  if private.bj_is_blackjack(s -> 'hands' -> 0 -> 'cards') then return private.bj_settle(s); end if;
  return jsonb_set(s, '{phase}', '"player"');
end $$;

create or replace function private.bj_dealer_play(s jsonb) returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  if exists (select 1 from jsonb_array_elements(s -> 'hands') h where (private.bj_value(h -> 'cards')).total <= 21) then
    while (private.bj_value(s -> 'dealer')).total < 17 loop
      s := private.bj_draw(s, -1);
    end loop;
  end if;
  return private.bj_settle(s);
end $$;

/** Moves to the next unfinished hand (dealing split hands their second card), or plays the dealer. */
create or replace function private.bj_advance(s jsonb) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare i int := (s ->> 'active')::int; n int := jsonb_array_length(s -> 'hands');
begin
  loop
    while i < n and (s -> 'hands' -> i ->> 'done')::boolean loop i := i + 1; end loop;
    if i >= n then
      return private.bj_dealer_play(jsonb_set(s, '{active}', to_jsonb(n - 1)));
    end if;
    if jsonb_array_length(s -> 'hands' -> i -> 'cards') = 1 then
      s := private.bj_draw(jsonb_set(s, '{active}', to_jsonb(i)), i);
      if (s -> 'hands' -> i ->> 'splitAces')::boolean or (private.bj_value(s -> 'hands' -> i -> 'cards')).total = 21 then
        s := private.bj_set_done(s, i);
        continue;
      end if;
    end if;
    return jsonb_set(jsonb_set(s, '{active}', to_jsonb(i)), '{phase}', '"player"');
  end loop;
end $$;

create or replace function private.bj_can_double(s jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select s ->> 'phase' = 'player'
    and jsonb_array_length(s -> 'hands' -> (s ->> 'active')::int -> 'cards') = 2
    and not (s -> 'hands' -> (s ->> 'active')::int ->> 'splitAces')::boolean
$$;

create or replace function private.bj_can_split(s jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select s ->> 'phase' = 'player'
    and jsonb_array_length(s -> 'hands' -> (s ->> 'active')::int -> 'cards') = 2
    and private.bj_rank_value(s -> 'hands' -> (s ->> 'active')::int -> 'cards' -> 0 ->> 'rank')
      = private.bj_rank_value(s -> 'hands' -> (s ->> 'active')::int -> 'cards' -> 1 ->> 'rank')
    and jsonb_array_length(s -> 'hands') < 4
$$;

/** What the player may see: no shoe, and the dealer's hole card stays face down until the hand ends. */
create or replace function private.bj_view(s jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'phase', s ->> 'phase',
    'dealer', case when s ->> 'phase' in ('insurance', 'player')
      then jsonb_build_array(s -> 'dealer' -> 0, jsonb_build_object('rank', '', 'suit', '', 'id', 'hole', 'hidden', true))
      else coalesce(s -> 'dealer', '[]') end,
    'hands', coalesce(s -> 'hands', '[]'),
    'active', coalesce((s ->> 'active')::int, 0),
    'insurance', coalesce((s ->> 'insurance')::numeric, 0),
    'result', s -> 'result',
    'reshuffled', coalesce((s ->> 'reshuffled')::boolean, false),
    'shoeLeft', round(jsonb_array_length(coalesce(s -> 'shoe', '[]')) / 312.0, 3),
    'canDouble', coalesce(private.bj_can_double(s), false),
    'canSplit', coalesce(private.bj_can_split(s), false))
$$;

create or replace function private.bj_finish(p_user uuid, p_run int, s jsonb) returns void
language plpgsql volatile set search_path = '' as $$
declare detail text; dealer text;
begin
  if s ->> 'phase' <> 'done' then return; end if;
  dealer := case when (s -> 'result' ->> 'dealerBlackjack')::boolean then 'blackjack' else (private.bj_value(s -> 'dealer')).total::text end;
  select string_agg(case h ->> 'outcome' when 'blackjack' then 'Blackjack' when 'win' then 'Win' when 'push' then 'Push'
      when 'bust' then 'Bust' else 'Lose' end, ', ' order by ord)
    into detail from jsonb_array_elements(s -> 'hands') with ordinality as t(h, ord);
  detail := detail || ' vs dealer ' || dealer;
  perform private.game_round(p_user, p_run, 'blackjack', (s -> 'result' ->> 'staked')::numeric, (s -> 'result' ->> 'returned')::numeric, detail);
  perform private.game_activity(p_user, 'blackjack', (s -> 'result' ->> 'staked')::numeric,
    (s -> 'result' ->> 'returned')::numeric - (s -> 'result' ->> 'staked')::numeric, lower(detail));
end $$;

create or replace function private.bj_load(p_user uuid) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare s jsonb; shoe jsonb;
begin
  select state into s from public.blackjack_tables where user_id = p_user for update;
  if s is null then
    shoe := private.bj_new_shoe();
    s := jsonb_build_object('phase', 'betting', 'shoe', shoe, 'cut', 78, 'dealer', '[]'::jsonb, 'hands', '[]'::jsonb,
      'active', 0, 'insurance', 0, 'result', null);
    insert into public.blackjack_tables (user_id, state) values (p_user, s);
  end if;
  return s;
end $$;

create or replace function private.bj_save(p_user uuid, s jsonb) returns void
language sql volatile set search_path = '' as $$
  update public.blackjack_tables set state = s, updated_at = now() where user_id = p_user
$$;

create or replace function public.blackjack_state() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid();
begin
  return private.bj_view(private.bj_load(v_user));
end $$;

create or replace function public.blackjack_deal(p_bet numeric) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); pf public.portfolios; s jsonb; bet numeric := round(p_bet, 2); shoe jsonb;
begin
  perform private.rate_limit(v_user, 'game', 40);
  if not (bet >= 1 and bet <= 1e9) then raise exception 'Bets start at $1.'; end if;
  select * into pf from public.portfolios where user_id = v_user for update;
  s := private.bj_load(v_user);
  if s ->> 'phase' in ('insurance', 'player') then raise exception 'Finish the current hand first.'; end if;
  if bet > pf.cash then raise exception 'Not enough cash for this bet.'; end if;
  update public.portfolios set cash = cash - bet where user_id = v_user;
  s := s || jsonb_build_object('dealer', '[]'::jsonb, 'hands', jsonb_build_array(private.bj_hand('[]', bet, false, false)),
    'active', 0, 'insurance', 0, 'result', null, 'reshuffled', false, 'run', pf.run);
  if jsonb_array_length(s -> 'shoe') <= (s ->> 'cut')::int then
    shoe := private.bj_new_shoe();
    s := s || jsonb_build_object('shoe', shoe, 'cut', 78, 'reshuffled', true);
  end if;
  s := private.bj_draw(s, 0);
  s := private.bj_draw(s, -1);
  s := private.bj_draw(s, 0);
  s := private.bj_draw(s, -1);
  if s -> 'dealer' -> 0 ->> 'rank' = 'A' then
    s := jsonb_set(s, '{phase}', '"insurance"');
  else
    s := private.bj_after_peek(s);
  end if;
  perform private.bj_finish(v_user, pf.run, s);
  perform private.bj_save(v_user, s);
  return jsonb_build_object('table', private.bj_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

/** p_action: hit, stand, double, split, insurance or no_insurance. */
create or replace function public.blackjack_act(p_action text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); pf public.portfolios; s jsonb; i int; h jsonb; cost numeric := 0; aces boolean; hands jsonb; k int;
begin
  perform private.rate_limit(v_user, 'game', 120);
  select * into pf from public.portfolios where user_id = v_user for update;
  s := private.bj_load(v_user);
  i := (s ->> 'active')::int;
  h := s -> 'hands' -> i;

  if p_action in ('insurance', 'no_insurance') then
    if s ->> 'phase' <> 'insurance' then raise exception 'Insurance is not on offer right now.'; end if;
    if p_action = 'insurance' then cost := round((s -> 'hands' -> 0 ->> 'bet')::numeric / 2, 2); end if;
    if cost > pf.cash then raise exception 'Not enough cash for insurance.'; end if;
    s := private.bj_after_peek(jsonb_set(s, '{insurance}', to_jsonb(cost)));
  elsif s ->> 'phase' <> 'player' then
    raise exception 'There is no hand to play. Deal first.';
  elsif p_action = 'hit' then
    s := private.bj_draw(s, i);
    if (private.bj_value(s -> 'hands' -> i -> 'cards')).total >= 21 then s := private.bj_set_done(s, i); end if;
    s := private.bj_advance(s);
  elsif p_action = 'stand' then
    s := private.bj_advance(private.bj_set_done(s, i));
  elsif p_action = 'double' then
    if not private.bj_can_double(s) then raise exception 'You can only double on your first two cards.'; end if;
    cost := (h ->> 'bet')::numeric;
    if cost > pf.cash then raise exception 'Not enough cash to double.'; end if;
    s := jsonb_set(s, array['hands', i::text], h || jsonb_build_object('bet', cost * 2, 'doubled', true));
    s := private.bj_draw(s, i);
    s := private.bj_advance(private.bj_set_done(s, i));
  elsif p_action = 'split' then
    if not private.bj_can_split(s) then raise exception 'Only pairs can be split, up to four hands.'; end if;
    cost := (h ->> 'bet')::numeric;
    if cost > pf.cash then raise exception 'Not enough cash to split.'; end if;
    aces := h -> 'cards' -> 0 ->> 'rank' = 'A';
    hands := '[]';
    for k in 0..jsonb_array_length(s -> 'hands') - 1 loop
      if k = i then
        hands := hands || jsonb_build_array(
          private.bj_hand(jsonb_build_array(h -> 'cards' -> 0), cost, true, aces),
          private.bj_hand(jsonb_build_array(h -> 'cards' -> 1), cost, true, aces));
      else
        hands := hands || jsonb_build_array(s -> 'hands' -> k);
      end if;
    end loop;
    s := private.bj_draw(jsonb_set(s, '{hands}', hands), i);
    if aces or (private.bj_value(s -> 'hands' -> i -> 'cards')).total = 21 then s := private.bj_set_done(s, i); end if;
    s := private.bj_advance(s);
  else
    raise exception 'Unknown move.';
  end if;

  if cost > 0 then update public.portfolios set cash = cash - cost where user_id = v_user; end if;
  perform private.bj_finish(v_user, coalesce((s ->> 'run')::int, pf.run), s);
  perform private.bj_save(v_user, s);
  return jsonb_build_object('table', private.bj_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

-- ---------------------------------------------------------------------------
-- Leaderboard
-- ---------------------------------------------------------------------------

/** Every player with overall, market and game figures for their current run. */
create or replace function public.leaderboard() returns jsonb
language sql stable security definer set search_path = '' as $$
  with pf as (
    select p.*, pr.username::text as username from public.portfolios p join public.profiles pr on pr.id = p.user_id
  ),
  pos as (
    select user_id, sum(private.position_value(p)) as value, sum(p.cost_basis) as cost, count(*) as open
    from public.positions p group by user_id
  ),
  closed as (
    select h.user_id, count(*) filter (where h.realized_pnl > 0) as wins, count(*) as total
    from public.history h join public.portfolios p on p.user_id = h.user_id and h.run = p.run
    where h.type in ('sell', 'settlement') group by h.user_id
  ),
  games as (
    select g.user_id, count(*) as rounds, sum(g.net) as net, sum(g.staked) as wagered, greatest(max(g.net), 0) as best
    from public.game_rounds g join public.portfolios p on p.user_id = g.user_id and g.run = p.run group by g.user_id
  ),
  fav as (
    select distinct on (g.user_id) g.user_id, g.game
    from public.game_rounds g join public.portfolios p on p.user_id = g.user_id and g.run = p.run
    group by g.user_id, g.game order by g.user_id, count(*) desc
  ),
  rows as (
    select pf.*, coalesce(pos.value, 0) as value, coalesce(pos.cost, 0) as cost, coalesce(pos.open, 0) as open,
      pf.cash + coalesce(pos.value, 0) as net_worth, closed.wins, closed.total,
      coalesce(games.rounds, 0) as g_rounds, coalesce(games.net, 0) as g_net, coalesce(games.wagered, 0) as g_wagered,
      coalesce(games.best, 0) as g_best, fav.game as fav
    from pf left join pos using (user_id) left join closed using (user_id) left join games using (user_id) left join fav using (user_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', user_id, 'name', username, 'sim', false,
    'netWorth', net_worth,
    'pnl', net_worth - run_start_cash,
    'pnlPct', case when run_start_cash > 0 then round((net_worth - run_start_cash) * 100 / run_start_cash, 4) else 0 end,
    'marketPnl', net_worth - run_start_cash - g_net,
    'realized', realized_pnl,
    'unrealized', value - cost,
    'trades', trade_count,
    'winRate', case when total > 0 then round(wins * 100.0 / total, 2) end,
    'openPositions', open,
    'games', jsonb_build_object('net', g_net, 'rounds', g_rounds, 'wagered', g_wagered, 'best', g_best, 'favorite', fav)
  ) order by net_worth desc), '[]')
  from (select * from rows order by net_worth desc limit 500) r
$$;

-- ---------------------------------------------------------------------------
-- Sync job entry points (service role only)
-- ---------------------------------------------------------------------------

/** Upserts markets ({ id, title, category, league, labels, yesPrice, noPrice, endDate, gameStart, closed }). */
create or replace function public.sync_markets(p_markets jsonb) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare m jsonb; n int := 0; y numeric; no_ numeric;
begin
  for m in select * from jsonb_array_elements(p_markets) loop
    continue when coalesce(m ->> 'id', '') !~ '^[A-Za-z0-9_.~:-]+$' or length(m ->> 'id') > 400 or coalesce(m ->> 'title', '') = '';
    y := (m ->> 'yesPrice')::numeric;
    no_ := (m ->> 'noPrice')::numeric;
    continue when y is null or no_ is null or y < 0 or y > 1 or no_ < 0 or no_ > 1;
    insert into public.markets (id, title, category, league, labels, yes_price, no_price, end_date, game_start, closed, data, updated_at)
    values (m ->> 'id', left(m ->> 'title', 300), coalesce(m ->> 'category', 'sports'), m ->> 'league',
      coalesce(m -> 'labels', '{"yes":"Yes","no":"No"}'), round(y, 4), round(no_, 4),
      (m ->> 'endDate')::timestamptz, (m ->> 'gameStart')::timestamptz, coalesce((m ->> 'closed')::boolean, false), m, now())
    on conflict (id) do update set title = excluded.title, category = excluded.category, league = excluded.league,
      labels = excluded.labels, yes_price = excluded.yes_price, no_price = excluded.no_price, end_date = excluded.end_date,
      game_start = excluded.game_start, closed = excluded.closed, data = excluded.data, updated_at = now();
    n := n + 1;
  end loop;
  delete from public.markets mk where mk.end_date < now() - interval '7 days'
    and not exists (select 1 from public.positions p where p.market_id = mk.id);
  delete from public.activity where created_at < now() - interval '30 days';
  return n;
end $$;

/** p_results: { "<market id>": { "outcome": "yes" | "no" | "void", "source": "...", "title": "..." } }. */
create or replace function public.sync_resolutions(p_results jsonb) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare k text; v jsonb; n int := 0;
begin
  for k, v in select * from jsonb_each(p_results) loop
    n := n + private.resolve(k, coalesce(v ->> 'outcome', v #>> '{}'), coalesce(v ->> 'source', 'sync'), v ->> 'title');
  end loop;
  return n;
end $$;

/** Market ids someone holds and that have no result yet, so the sync job knows what to settle. */
create or replace function public.held_markets() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(distinct p.market_id), '[]') from public.positions p
  where not exists (select 1 from public.resolutions r where r.market_id = p.market_id)
$$;

create or replace function public.sync_snapshots() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare u uuid; n int := 0;
begin
  for u in select user_id from public.portfolios loop
    perform private.snapshot(u);
    n := n + 1;
  end loop;
  delete from private.rate_limits where window_start < now() - interval '1 hour';
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Provably fair games: Dice, Mines, Chicken Cross
--
-- Every result comes from HMAC_SHA256(server seed, "<client seed>:<nonce>:<cursor>"),
-- 4 bytes per float, exactly like src/games/fair.js. Players see the SHA-256
-- of the server seed before betting and the seed itself once they rotate.
-- ---------------------------------------------------------------------------

create or replace function private.fair_floats(p_server text, p_client text, p_nonce int, p_count int) returns float8[]
language plpgsql immutable set search_path = '' as $$
declare res float8[] := '{}'; cur int := 0; b bytea; i int;
begin
  while coalesce(array_length(res, 1), 0) < p_count loop
    b := extensions.hmac(convert_to(p_client || ':' || p_nonce || ':' || cur, 'UTF8'), convert_to(p_server, 'UTF8'), 'sha256');
    i := 0;
    while i < 32 and coalesce(array_length(res, 1), 0) < p_count loop
      res := res || (get_byte(b, i) / 256::float8 + get_byte(b, i + 1) / 65536::float8
        + get_byte(b, i + 2) / 16777216::float8 + get_byte(b, i + 3) / 4294967296::float8);
      i := i + 4;
    end loop;
    cur := cur + 1;
  end loop;
  return res;
end $$;

create or replace function private.fair_load(p_user uuid) returns public.fair_seeds
language plpgsql volatile set search_path = '' as $$
declare r public.fair_seeds;
begin
  select * into r from public.fair_seeds where user_id = p_user for update;
  if r.user_id is null then
    insert into public.fair_seeds (user_id, server_seed, client_seed)
    values (p_user, encode(extensions.gen_random_bytes(32), 'hex'), encode(extensions.gen_random_bytes(8), 'hex'))
    returning * into r;
  end if;
  return r;
end $$;

/** Seeds for the next bet; the nonce then moves on. */
create or replace function private.fair_next(p_user uuid, out server_seed text, out client_seed text, out nonce int)
language plpgsql volatile set search_path = '' as $$
declare r public.fair_seeds := private.fair_load(p_user);
begin
  server_seed := r.server_seed;
  client_seed := r.client_seed;
  nonce := r.nonce;
  update public.fair_seeds set nonce = r.nonce + 1, updated_at = now() where user_id = p_user;
end $$;

create or replace function private.round_active(p_user uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.game_states where user_id = p_user and state ->> 'phase' = 'playing')
$$;

create or replace function private.fair_json(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'serverSeedHash', encode(extensions.digest(server_seed, 'sha256'), 'hex'),
    'clientSeed', client_seed,
    'nonce', nonce,
    'previous', case when prev_server_seed is null then null else jsonb_build_object(
      'serverSeed', prev_server_seed,
      'serverSeedHash', encode(extensions.digest(prev_server_seed, 'sha256'), 'hex'),
      'clientSeed', prev_client_seed,
      'nonce', prev_nonce) end)
  from public.fair_seeds where user_id = p_user
$$;

create or replace function public.fair_state() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid();
begin
  perform private.fair_load(v_user);
  return private.fair_json(v_user);
end $$;

/** Reveals the current server seed and starts a new pair (with the player's new client seed). */
create or replace function public.fair_rotate(p_client_seed text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); r public.fair_seeds;
begin
  if coalesce(p_client_seed, '') !~ '^[!-~]{1,64}$' then raise exception 'Client seeds use 1 to 64 letters, numbers or symbols, with no spaces.'; end if;
  if private.round_active(v_user) then raise exception 'Finish your Mines or Chicken Cross round before changing seeds.'; end if;
  r := private.fair_load(v_user);
  update public.fair_seeds set prev_server_seed = r.server_seed, prev_client_seed = r.client_seed, prev_nonce = r.nonce,
    server_seed = encode(extensions.gen_random_bytes(32), 'hex'), client_seed = p_client_seed, nonce = 0, updated_at = now()
  where user_id = v_user;
  return private.fair_json(v_user);
end $$;

create or replace function private.bet_amount(p_amount numeric) returns numeric
language plpgsql immutable set search_path = '' as $$
declare amt numeric := round(p_amount, 2);
begin
  if not (amt >= 0.1 and amt <= 1e9) then raise exception 'Enter a bet of at least $0.10.'; end if;
  return amt;
end $$;

create or replace function private.fmt_mult(m numeric) returns text
language sql immutable set search_path = '' as $$ select trim(trailing '.' from trim(trailing '0' from m::text)) || '×' $$;

-- Dice ------------------------------------------------------------------------

create or replace function public.play_dice(p_amount numeric, p_target numeric, p_over boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); pf public.portfolios; amt numeric := private.bet_amount(p_amount); t int; fs record;
  v_roll int; chance int; mult numeric; win boolean; ret numeric;
begin
  perform private.rate_limit(v_user, 'dice', 150);
  if p_target is null or round(p_target, 2) < 2 or round(p_target, 2) > 98 then raise exception 'Pick a target between 2 and 98.'; end if;
  t := (round(p_target, 2) * 100)::int;
  select * into pf from public.portfolios where user_id = v_user for update;
  if amt > pf.cash then raise exception 'Not enough cash for this bet.'; end if;
  select * into fs from private.fair_next(v_user);
  v_roll := floor((private.fair_floats(fs.server_seed, fs.client_seed, fs.nonce, 1))[1] * 10001)::int;
  chance := case when p_over then 10000 - t else t end;
  mult := floor(99000000::numeric / chance) / 10000;
  win := case when p_over then v_roll > t else v_roll < t end;
  ret := case when win then round(amt * mult, 2) else 0 end;
  update public.portfolios set cash = cash - amt where user_id = v_user;
  perform private.game_round(v_user, pf.run, 'dice', amt, ret, format('Rolled %s · %s %s (%s)',
    to_char(v_roll / 100.0, 'FM990.00'), case when p_over then 'over' else 'under' end, to_char(t / 100.0, 'FM990.00'), private.fmt_mult(mult)));
  if win and mult >= 5 then
    perform private.game_activity(v_user, 'dice', amt, ret - amt, format('rolled %s at %s', to_char(v_roll / 100.0, 'FM990.00'), private.fmt_mult(mult)));
  end if;
  return jsonb_build_object('roll', v_roll, 'win', win, 'multiplier', mult, 'payout', ret, 'nonce', fs.nonce,
    'portfolio', private.portfolio_json(v_user));
end $$;

-- Mines -----------------------------------------------------------------------

create or replace function private.mines_mult(p_mines int, p_gems int) returns numeric
language plpgsql immutable set search_path = '' as $$
declare num numeric := 99; den numeric := 100; i int;
begin
  if p_gems <= 0 then return 1; end if;
  for i in 0..p_gems - 1 loop
    num := num * (25 - i);
    den := den * (25 - p_mines - i);
  end loop;
  return floor(num * 100 / den) / 100;
end $$;

create or replace function private.mines_place(p_floats float8[], p_mines int) returns int[]
language plpgsql immutable set search_path = '' as $$
declare tiles int[] := (select array_agg(x order by x) from generate_series(0, 24) x); ord int[] := '{}'; i int; j int;
begin
  for i in 0..23 loop
    j := floor(p_floats[i + 1] * (25 - i))::int;
    ord := ord || tiles[j + 1];
    tiles := tiles[1:j] || tiles[j + 2:];
  end loop;
  ord := ord || tiles[1];
  return (select array_agg(x order by x) from unnest(ord[1:p_mines]) x);
end $$;

/** What the player sees: mine positions only once the round is over. */
create or replace function private.mines_view(s jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare gems int; m int;
begin
  if s is null then return jsonb_build_object('phase', 'idle'); end if;
  gems := jsonb_array_length(s -> 'revealed');
  m := (s ->> 'mines')::int;
  return jsonb_build_object(
    'phase', s ->> 'phase', 'bet', (s ->> 'bet')::numeric, 'mines', m, 'revealed', s -> 'revealed', 'gems', gems,
    'multiplier', private.mines_mult(m, gems),
    'nextMultiplier', case when gems < 25 - m then private.mines_mult(m, gems + 1) end,
    'payout', round((s ->> 'bet')::numeric * private.mines_mult(m, gems), 2),
    'nonce', (s ->> 'nonce')::int,
    'result', case when s ->> 'phase' = 'done' then (s -> 'result') || jsonb_build_object('positions', s -> 'positions') end);
end $$;

create or replace function private.mines_finish(p_user uuid, s jsonb, p_win boolean, p_hit int) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare gems int := jsonb_array_length(s -> 'revealed'); m int := (s ->> 'mines')::int; bet numeric := (s ->> 'bet')::numeric;
  mult numeric := case when p_win then private.mines_mult(m, gems) else 0 end; ret numeric := round(bet * mult, 2);
begin
  perform private.game_round(p_user, (s ->> 'run')::int, 'mines', bet, ret,
    case when p_win then format('%s gem%s · %s mine%s (%s)', gems, case when gems = 1 then '' else 's' end, m, case when m = 1 then '' else 's' end, private.fmt_mult(mult))
    else format('Mine on pick %s · %s mine%s', gems + 1, m, case when m = 1 then '' else 's' end) end);
  if p_win and mult >= 2 then
    perform private.game_activity(p_user, 'mines', bet, ret - bet, format('cashed out %s with %s mines', private.fmt_mult(mult), m));
  end if;
  return s || jsonb_build_object('phase', 'done', 'result', jsonb_build_object('win', p_win, 'hit', p_hit, 'multiplier', mult, 'payout', ret));
end $$;

create or replace function private.mines_begin(p_user uuid, p_amount numeric, p_mines int) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare pf public.portfolios; amt numeric := private.bet_amount(p_amount); fs record;
begin
  if p_mines is null or p_mines < 1 or p_mines > 24 then raise exception 'Pick 1 to 24 mines.'; end if;
  if private.round_active(p_user) then raise exception 'Finish the current round first.'; end if;
  select * into pf from public.portfolios where user_id = p_user for update;
  if amt > pf.cash then raise exception 'Not enough cash for this bet.'; end if;
  update public.portfolios set cash = cash - amt where user_id = p_user;
  select * into fs from private.fair_next(p_user);
  return jsonb_build_object('phase', 'playing', 'bet', amt, 'mines', p_mines, 'revealed', '[]'::jsonb, 'run', pf.run, 'nonce', fs.nonce,
    'positions', to_jsonb(private.mines_place(private.fair_floats(fs.server_seed, fs.client_seed, fs.nonce, 24), p_mines)));
end $$;

create or replace function private.mines_pick(p_user uuid, s jsonb, p_tile int) returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  if p_tile is null or p_tile < 0 or p_tile > 24 then raise exception 'Pick a tile from 0 to 24.'; end if;
  if s -> 'revealed' @> to_jsonb(p_tile) then raise exception 'That tile is already open.'; end if;
  if s -> 'positions' @> to_jsonb(p_tile) then return private.mines_finish(p_user, s, false, p_tile); end if;
  s := jsonb_set(s, '{revealed}', (s -> 'revealed') || to_jsonb(p_tile));
  if jsonb_array_length(s -> 'revealed') = 25 - (s ->> 'mines')::int then return private.mines_finish(p_user, s, true, null); end if;
  return s;
end $$;

create or replace function private.state_save(p_user uuid, p_game text, s jsonb) returns void
language sql volatile set search_path = '' as $$
  insert into public.game_states (user_id, game, state) values (p_user, p_game, s)
  on conflict (user_id, game) do update set state = excluded.state, updated_at = now()
$$;

create or replace function private.state_load(p_user uuid, p_game text) returns jsonb
language sql volatile set search_path = '' as $$
  select state from public.game_states where user_id = p_user and game = p_game for update
$$;

create or replace function public.mines_state() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return private.mines_view(private.state_load(private.uid(), 'mines'));
end $$;

create or replace function public.mines_start(p_amount numeric, p_mines int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); s jsonb;
begin
  perform private.rate_limit(v_user, 'mines', 120);
  s := private.mines_begin(v_user, p_amount, p_mines);
  perform private.state_save(v_user, 'mines', s);
  return jsonb_build_object('round', private.mines_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

create or replace function public.mines_reveal(p_tile int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); s jsonb;
begin
  perform private.rate_limit(v_user, 'step', 300);
  perform 1 from public.portfolios where user_id = v_user for update;
  s := private.state_load(v_user, 'mines');
  if s is null or s ->> 'phase' <> 'playing' then raise exception 'Start a round first.'; end if;
  s := private.mines_pick(v_user, s, p_tile);
  perform private.state_save(v_user, 'mines', s);
  return jsonb_build_object('round', private.mines_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

create or replace function public.mines_cashout() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); s jsonb;
begin
  perform 1 from public.portfolios where user_id = v_user for update;
  s := private.state_load(v_user, 'mines');
  if s is null or s ->> 'phase' <> 'playing' then raise exception 'There is no round to cash out.'; end if;
  if jsonb_array_length(s -> 'revealed') = 0 then raise exception 'Open at least one tile first.'; end if;
  s := private.mines_finish(v_user, s, true, null);
  perform private.state_save(v_user, 'mines', s);
  return jsonb_build_object('round', private.mines_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

/** Auto play: opens the given tiles in order and cashes out if they are all safe. */
create or replace function public.mines_auto(p_amount numeric, p_mines int, p_tiles int[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); s jsonb; t int;
begin
  perform private.rate_limit(v_user, 'mines', 120);
  if coalesce(array_length(p_tiles, 1), 0) < 1 or array_length(p_tiles, 1) > 25 - coalesce(p_mines, 1)
    or (select count(distinct x) from unnest(p_tiles) x) <> array_length(p_tiles, 1) then
    raise exception 'Pick between 1 and % different tiles.', 25 - coalesce(p_mines, 1);
  end if;
  s := private.mines_begin(v_user, p_amount, p_mines);
  foreach t in array p_tiles loop
    s := private.mines_pick(v_user, s, t);
    exit when s ->> 'phase' = 'done';
  end loop;
  if s ->> 'phase' = 'playing' then s := private.mines_finish(v_user, s, true, null); end if;
  perform private.state_save(v_user, 'mines', s);
  return jsonb_build_object('round', private.mines_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

-- Chicken Cross ------------------------------------------------------------------

create or replace function private.chicken_cfg(p_difficulty text, out lanes int, out num int, out den int)
language plpgsql immutable set search_path = '' as $$
begin
  case p_difficulty
    when 'easy' then lanes := 30; num := 24; den := 25;
    when 'medium' then lanes := 25; num := 22; den := 25;
    when 'hard' then lanes := 22; num := 4; den := 5;
    when 'daredevil' then lanes := 18; num := 3; den := 5;
    else raise exception 'Pick Easy, Medium, Hard or Daredevil.';
  end case;
end $$;

create or replace function private.chicken_mult(p_difficulty text, p_lane int) returns numeric
language plpgsql immutable set search_path = '' as $$
declare c record; a numeric := 98; b numeric := 1; i int;
begin
  if p_lane <= 0 then return 1; end if;
  select * into c from private.chicken_cfg(p_difficulty);
  for i in 1..p_lane loop
    a := a * c.den;
    b := b * c.num;
  end loop;
  return floor(a / b) / 100;
end $$;

create or replace function private.chicken_view(s jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare lane int; d text; c record;
begin
  if s is null then return jsonb_build_object('phase', 'idle'); end if;
  lane := (s ->> 'lane')::int;
  d := s ->> 'difficulty';
  select * into c from private.chicken_cfg(d);
  return jsonb_build_object(
    'phase', s ->> 'phase', 'bet', (s ->> 'bet')::numeric, 'difficulty', d, 'lane', lane, 'lanes', c.lanes,
    'multiplier', private.chicken_mult(d, lane),
    'nextMultiplier', case when lane < c.lanes then private.chicken_mult(d, lane + 1) end,
    'payout', round((s ->> 'bet')::numeric * private.chicken_mult(d, lane), 2),
    'nonce', (s ->> 'nonce')::int,
    'result', case when s ->> 'phase' = 'done' then s -> 'result' end);
end $$;

create or replace function private.chicken_finish(p_user uuid, s jsonb, p_win boolean) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare lane int := (s ->> 'lane')::int; d text := s ->> 'difficulty'; bet numeric := (s ->> 'bet')::numeric;
  mult numeric := case when p_win then private.chicken_mult(d, lane) else 0 end; ret numeric := round(bet * mult, 2);
  label text := initcap(d);
begin
  perform private.game_round(p_user, (s ->> 'run')::int, 'chicken', bet, ret,
    case when p_win then format('Lane %s · %s (%s)', lane, label, private.fmt_mult(mult))
    else format('Hit on lane %s · %s', lane + 1, label) end);
  if p_win and mult >= 2 then
    perform private.game_activity(p_user, 'chicken', bet, ret - bet, format('crossed %s lanes on %s (%s)', lane, lower(label), private.fmt_mult(mult)));
  end if;
  return s || jsonb_build_object('phase', 'done', 'result', jsonb_build_object('win', p_win, 'lane', lane,
    'hitLane', case when p_win then null else lane + 1 end, 'multiplier', mult, 'payout', ret, 'crashLane', s -> 'crash'));
end $$;

create or replace function private.chicken_begin(p_user uuid, p_amount numeric, p_difficulty text) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare pf public.portfolios; amt numeric := private.bet_amount(p_amount); c record; fs record; f float8[]; crash int; i int;
begin
  select * into c from private.chicken_cfg(p_difficulty);
  if private.round_active(p_user) then raise exception 'Finish the current round first.'; end if;
  select * into pf from public.portfolios where user_id = p_user for update;
  if amt > pf.cash then raise exception 'Not enough cash for this bet.'; end if;
  update public.portfolios set cash = cash - amt where user_id = p_user;
  select * into fs from private.fair_next(p_user);
  f := private.fair_floats(fs.server_seed, fs.client_seed, fs.nonce, c.lanes);
  for i in 1..c.lanes loop
    if f[i] * c.den >= c.num then crash := i; exit; end if;
  end loop;
  return jsonb_build_object('phase', 'playing', 'bet', amt, 'difficulty', p_difficulty, 'lane', 0, 'run', pf.run,
    'nonce', fs.nonce, 'crash', crash);
end $$;

create or replace function private.chicken_hop(p_user uuid, s jsonb) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare nxt int := (s ->> 'lane')::int + 1; c record;
begin
  select * into c from private.chicken_cfg(s ->> 'difficulty');
  if (s ->> 'crash')::int = nxt then return private.chicken_finish(p_user, s, false); end if;
  s := jsonb_set(s, '{lane}', to_jsonb(nxt));
  if nxt >= c.lanes then return private.chicken_finish(p_user, s, true); end if;
  return s;
end $$;

create or replace function public.chicken_state() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return private.chicken_view(private.state_load(private.uid(), 'chicken'));
end $$;

create or replace function public.chicken_start(p_amount numeric, p_difficulty text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); s jsonb;
begin
  perform private.rate_limit(v_user, 'chicken', 120);
  s := private.chicken_begin(v_user, p_amount, p_difficulty);
  perform private.state_save(v_user, 'chicken', s);
  return jsonb_build_object('round', private.chicken_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

create or replace function public.chicken_step() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); s jsonb;
begin
  perform private.rate_limit(v_user, 'step', 300);
  perform 1 from public.portfolios where user_id = v_user for update;
  s := private.state_load(v_user, 'chicken');
  if s is null or s ->> 'phase' <> 'playing' then raise exception 'Start a round first.'; end if;
  s := private.chicken_hop(v_user, s);
  perform private.state_save(v_user, 'chicken', s);
  return jsonb_build_object('round', private.chicken_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

create or replace function public.chicken_cashout() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); s jsonb;
begin
  perform 1 from public.portfolios where user_id = v_user for update;
  s := private.state_load(v_user, 'chicken');
  if s is null or s ->> 'phase' <> 'playing' then raise exception 'There is no round to cash out.'; end if;
  if (s ->> 'lane')::int = 0 then raise exception 'Cross at least one lane first.'; end if;
  s := private.chicken_finish(v_user, s, true);
  perform private.state_save(v_user, 'chicken', s);
  return jsonb_build_object('round', private.chicken_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

/** Auto play: hops until the target lane (cashing out there) or until hit. */
create or replace function public.chicken_auto(p_amount numeric, p_difficulty text, p_target int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := private.uid(); s jsonb; c record;
begin
  perform private.rate_limit(v_user, 'chicken', 120);
  select * into c from private.chicken_cfg(p_difficulty);
  if p_target is null or p_target < 1 or p_target > c.lanes then raise exception 'Pick a lane from 1 to %.', c.lanes; end if;
  s := private.chicken_begin(v_user, p_amount, p_difficulty);
  while s ->> 'phase' = 'playing' and (s ->> 'lane')::int < p_target loop
    s := private.chicken_hop(v_user, s);
  end loop;
  if s ->> 'phase' = 'playing' then s := private.chicken_finish(v_user, s, true); end if;
  perform private.state_save(v_user, 'chicken', s);
  return jsonb_build_object('round', private.chicken_view(s), 'portfolio', private.portfolio_json(v_user));
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public;
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.reset_password_with_code(text, text, text) to anon, authenticated;
grant execute on function public.leaderboard() to anon, authenticated;
grant execute on function
  public.get_portfolio(),
  public.create_recovery_code(),
  public.buy(text, text, numeric, numeric),
  public.sell(text, text, numeric, numeric),
  public.reset_balance(),
  public.delete_account(text),
  public.check_market(text),
  public.play_roulette(jsonb),
  public.play_plinko(numeric, int, text, int),
  public.blackjack_state(),
  public.blackjack_deal(numeric),
  public.blackjack_act(text),
  public.fair_state(),
  public.fair_rotate(text),
  public.play_dice(numeric, numeric, boolean),
  public.mines_state(),
  public.mines_start(numeric, int),
  public.mines_reveal(int),
  public.mines_cashout(),
  public.mines_auto(numeric, int, int[]),
  public.chicken_state(),
  public.chicken_start(numeric, text),
  public.chicken_step(),
  public.chicken_cashout(),
  public.chicken_auto(numeric, text, int)
to authenticated;

do $$ begin
  grant execute on function public.sync_markets(jsonb), public.sync_resolutions(jsonb), public.held_markets(), public.sync_snapshots() to service_role;
exception when undefined_object then null;
end $$;
