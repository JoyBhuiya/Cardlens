-- Retention: delete inactive accounts after a warning, and hold less about sessions.
-- Backward-compatible: only adds nullable columns and clears session IP / user agent, which the previous
-- release never reads back.

alter table "user" add column if not exists last_active_at timestamptz;
alter table "user" add column if not exists retention_warned_at timestamptz;

-- Best guess for existing users: their latest session activity, else when they signed up.
update "user" u
set last_active_at = coalesce((select max(s."updatedAt") from "session" s where s."userId" = u.id), u."createdAt")
where last_active_at is null;

create index if not exists user_last_active_idx on "user" (last_active_at);

-- Sessions no longer keep IP address or browser string (rate limiting reads the request, not the session).
update "session" set "ipAddress" = null, "userAgent" = null where "ipAddress" is not null or "userAgent" is not null;
