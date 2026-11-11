-- Cardlens initial schema (plain Postgres 16; ported from the Supabase version, same tables).
-- All money is whole pence (bigint). Every user-owned table has user_id with RLS:
-- user_id = app.current_user_id(), which the app sets per transaction (src/lib/db/index.ts).
-- Runs as the database owner. The app connects as cardlens_app, which is not the owner, so RLS applies to it.

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select from pg_roles where rolname = 'cardlens_app') then
    create role cardlens_app login;
  end if;
end $$;

create schema app;
-- The signed-in user for this transaction, or null. Set with set_config('app.user_id', <uuid>, true).
create function app.current_user_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ───────────────────────── Auth (Better Auth core schema, uuid ids) ─────────────────────────
create table "user" (
  "id" uuid default gen_random_uuid() not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);
create table "session" (
  "id" uuid default gen_random_uuid() not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references "user" ("id") on delete cascade
);
create table "account" (
  "id" uuid default gen_random_uuid() not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null
);
create table "verification" (
  "id" uuid default gen_random_uuid() not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- ───────────────────────── Enums ─────────────────────────
create type public.waitlist_segment as enum ('side_business', 'personal', 'professional');
create type public.statement_status as enum ('uploaded', 'extracting', 'processing', 'parsed', 'needs_review', 'failed');
create type public.txn_direction as enum ('debit', 'credit');
create type public.txn_kind as enum ('purchase', 'payment', 'refund', 'fee', 'interest', 'cash_advance', 'balance_transfer', 'other');
create type public.category_group as enum ('essentials', 'lifestyle', 'financial');

-- ───────────────────────── Waitlist ─────────────────────────
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) between 3 and 320),
  segment public.waitlist_segment not null default 'personal',
  cards text check (char_length(cards) <= 200),
  source text check (char_length(source) <= 100),
  created_at timestamptz not null default now()
);
-- Written only by the server action (rate-limited); the app role may insert but not read it.

-- ───────────────────────── Cards ─────────────────────────
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  issuer text not null check (char_length(issuer) between 1 and 80),
  nickname text check (char_length(nickname) <= 80),
  last4 char(4) check (last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);
create index cards_user_idx on public.cards(user_id);

-- ───────────────────────── Statements ─────────────────────────
create table public.statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  file_path text,
  file_name text,
  file_type text not null check (file_type in ('pdf', 'csv')),
  status public.statement_status not null default 'uploaded',
  issuer text,
  period_start date,
  period_end date,
  opening_balance_pence bigint,
  closing_balance_pence bigint,
  total_debits_pence bigint,
  total_credits_pence bigint,
  reconciled boolean,
  reconciliation_diff_pence bigint,
  transaction_count int not null default 0,
  duplicates_dropped int not null default 0,
  keep_file boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index statements_user_idx on public.statements(user_id, created_at desc);
create index statements_card_idx on public.statements(card_id);

-- ───────────────────────── Categories ─────────────────────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references "user"(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  "group" public.category_group not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  constraint categories_system_has_no_user check ((is_system and user_id is null) or (not is_system and user_id is not null))
);
create unique index categories_system_slug on public.categories(slug) where is_system;
create unique index categories_user_slug on public.categories(user_id, slug) where not is_system;

-- ───────────────────────── Transactions ─────────────────────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  statement_id uuid not null references public.statements(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  posted_on date not null,
  description_raw text not null,
  merchant text not null,
  amount_pence bigint not null check (amount_pence >= 0),
  direction public.txn_direction not null,
  kind public.txn_kind not null,
  category text not null default 'uncategorised',
  category_source text not null default 'system' check (category_source in ('user_rule', 'dictionary', 'ai', 'kind', 'user', 'system')),
  is_business boolean not null default false,
  is_recurring boolean not null default false,
  foreign_currency boolean not null default false,
  dedupe_hash text not null,
  created_at timestamptz not null default now()
);
create unique index transactions_dedupe on public.transactions(user_id, dedupe_hash);
create index transactions_user_date on public.transactions(user_id, posted_on);
create index transactions_statement on public.transactions(statement_id);
create index transactions_merchant on public.transactions(user_id, merchant);

-- ───────────────────────── Merchant rules ─────────────────────────
create table public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  pattern text not null check (char_length(pattern) between 2 and 120),
  merchant text not null check (char_length(merchant) between 1 and 120),
  category text,
  is_business boolean,
  created_at timestamptz not null default now()
);
create unique index merchant_rules_user_pattern on public.merchant_rules(user_id, lower(pattern));

-- ───────────────────────── Reports ─────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  metrics jsonb not null,
  summary jsonb not null,
  model text,
  summary_source text not null default 'ai' check (summary_source in ('ai', 'template')),
  created_at timestamptz not null default now(),
  unique (user_id, year)
);

-- ───────────────────────── updated_at trigger ─────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger statements_touch before update on public.statements
  for each row execute function public.touch_updated_at();

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.cards enable row level security;
alter table public.statements enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.merchant_rules enable row level security;
alter table public.reports enable row level security;

create policy "cards_owner" on public.cards for all to cardlens_app
  using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id);
create policy "statements_owner" on public.statements for all to cardlens_app
  using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id);
create policy "transactions_owner" on public.transactions for all to cardlens_app
  using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id);
create policy "merchant_rules_owner" on public.merchant_rules for all to cardlens_app
  using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id);
create policy "reports_owner" on public.reports for all to cardlens_app
  using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id);

create policy "categories_read" on public.categories for select to cardlens_app
  using (is_system or (select app.current_user_id()) = user_id);
create policy "categories_write_own" on public.categories for insert to cardlens_app
  with check (not is_system and (select app.current_user_id()) = user_id);
create policy "categories_update_own" on public.categories for update to cardlens_app
  using (not is_system and (select app.current_user_id()) = user_id) with check (not is_system and (select app.current_user_id()) = user_id);
create policy "categories_delete_own" on public.categories for delete to cardlens_app
  using (not is_system and (select app.current_user_id()) = user_id);

-- ───────────────────────── System categories ─────────────────────────
insert into public.categories (slug, name, "group", is_system) values
  ('groceries', 'Groceries', 'essentials', true),
  ('utilities', 'Utilities and bills', 'essentials', true),
  ('transport', 'Transport and fuel', 'essentials', true),
  ('housing', 'Housing', 'essentials', true),
  ('health', 'Health and pharmacy', 'essentials', true),
  ('insurance', 'Insurance', 'essentials', true),
  ('education', 'Education and childcare', 'essentials', true),
  ('dining', 'Dining out', 'lifestyle', true),
  ('takeaway', 'Takeaway and delivery', 'lifestyle', true),
  ('shopping', 'Shopping', 'lifestyle', true),
  ('travel', 'Travel', 'lifestyle', true),
  ('entertainment', 'Entertainment', 'lifestyle', true),
  ('subscriptions', 'Subscriptions', 'lifestyle', true),
  ('personal_care', 'Personal care', 'lifestyle', true),
  ('gifts_charity', 'Gifts and charity', 'lifestyle', true),
  ('home', 'Home and garden', 'lifestyle', true),
  ('business', 'Business costs', 'financial', true),
  ('fees_interest', 'Fees and interest', 'financial', true),
  ('cash', 'Cash', 'financial', true),
  ('payments', 'Card payments', 'financial', true),
  ('refunds', 'Refunds', 'financial', true),
  ('transfers', 'Balance transfers', 'financial', true),
  ('uncategorised', 'Uncategorised', 'lifestyle', true);

-- ───────────────────────── Grants for the app role ─────────────────────────
-- Statement files live on disk (STORAGE_DIR), not in the database.
grant usage on schema public, app to cardlens_app;
grant execute on function app.current_user_id() to cardlens_app;
grant select, insert, update, delete on "user", "session", "account", "verification" to cardlens_app;
grant select, insert, update, delete on public.cards, public.statements, public.categories, public.transactions,
  public.merchant_rules, public.reports to cardlens_app;
grant insert on public.waitlist to cardlens_app;
