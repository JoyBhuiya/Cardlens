-- Spend caps and abuse limits.
-- usage_events is append-only for the app: it can insert and read, never update or delete, so deleting
-- statements does not reset a user's upload or AI allowance. Rows also carry token counts for unit economics.

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references "user"(id) on delete cascade,
  kind text not null check (kind in ('upload', 'ai_call')),
  purpose text check (purpose in ('extract', 'categorise', 'summary')),
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
create index usage_events_user_kind_time on public.usage_events(user_id, kind, created_at);
create index usage_events_kind_time on public.usage_events(kind, created_at);

-- Fixed-window counters for anonymous endpoints (key = purpose + hashed IP). No raw IPs are stored.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (key, window_start)
);

grant select, insert on public.usage_events to cardlens_app;
grant usage on sequence public.usage_events_id_seq to cardlens_app;
grant select, insert, update, delete on public.rate_limits to cardlens_app;
