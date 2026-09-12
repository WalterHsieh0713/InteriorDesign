-- One-time setup for Stage 4 persistence. Run this once in the Supabase
-- dashboard's SQL Editor (Project > SQL Editor > paste > Run).
--
-- No RLS policies are added on purpose: RLS is enabled with zero policies,
-- which blocks the anon/public key entirely. Only the server-side
-- service_role key (used in API routes, which bypasses RLS) can read/write
-- this table — matches how the photos storage bucket is accessed.

create table if not exists rooms (
  session_id text primary key,
  layout jsonb not null,
  updated_at timestamptz not null default now()
);

alter table rooms enable row level security;
