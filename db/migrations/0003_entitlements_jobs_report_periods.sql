-- Plans and payments, background processing, and report periods.
-- Backward-compatible with the previous release: only new tables and a new nullable-then-filled column.

-- ───────────────────────── Entitlements (paid plans) ─────────────────────────
-- One row per purchase: a £9 one-off "personal" report (12 months of access) or a £29/year "side_business"
-- subscription. Written only by the verified Stripe webhook (or by hand for support); read by the owner.
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  plan text not null check (plan in ('personal', 'side_business')),
  status text not null check (status in ('active', 'past_due', 'canceled', 'expired')),
  source text not null default 'stripe' check (source in ('stripe', 'manual')),
  stripe_customer_id text,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  -- One-off purchases: the payment, so a full refund can end access.
  stripe_payment_intent_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index entitlements_user_idx on public.entitlements(user_id);
create trigger entitlements_touch before update on public.entitlements
  for each row execute function public.touch_updated_at();

alter table public.entitlements enable row level security;
create policy "entitlements_owner" on public.entitlements for all to cardlens_app
  using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id);
-- No delete: purchase history is kept until the user deletes their account (cascade).
grant select, insert, update on public.entitlements to cardlens_app;

-- Stripe webhook events already applied (idempotency and audit). Holds ids and types only, no personal data.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
grant select, insert on public.stripe_events to cardlens_app;

-- ───────────────────────── Background statement processing ─────────────────────────
-- One job per statement. The in-process worker claims jobs across users with FOR UPDATE SKIP LOCKED, so this
-- table has no RLS; it holds only ids and status. The statement itself is processed through userDb (RLS).
create table public.statement_jobs (
  statement_id uuid primary key references public.statements(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index statement_jobs_ready on public.statement_jobs(status, run_after);
create trigger statement_jobs_touch before update on public.statement_jobs
  for each row execute function public.touch_updated_at();
grant select, insert, update, delete on public.statement_jobs to cardlens_app;

-- ───────────────────────── Report periods ─────────────────────────
-- Reports were one per calendar year. Now one per period: "2026" (calendar year), "tax-2025" (UK tax year
-- 6 Apr 2025 – 5 Apr 2026) or "m-2025-11" (12 months from November 2025). `year` stays as the start year.
alter table public.reports add column period_key text;
update public.reports set period_key = year::text where period_key is null;
alter table public.reports alter column period_key set not null;
alter table public.reports add constraint reports_period_key_format check (period_key ~ '^(\d{4}|tax-\d{4}|m-\d{4}-\d{2})$');
alter table public.reports drop constraint if exists reports_user_id_year_key;
alter table public.reports add constraint reports_user_period_key unique (user_id, period_key);
-- Rollback safety: the previous release inserts without period_key; treat those as calendar-year reports.
-- (Its `on conflict (user_id, year)` no longer has a matching constraint, so on a rollback "Build report"
-- fails cleanly with "Could not save the report" until this release is restored; nothing else is affected.)
create function public.reports_default_period_key() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.period_key is null then new.period_key = new.year::text; end if;
  return new;
end; $$;
create trigger reports_period_key_default before insert on public.reports
  for each row execute function public.reports_default_period_key();
