-- Social layer tables. Run this once in the Supabase dashboard's SQL
-- Editor (Project > SQL Editor > paste > Run). See SOCIAL_PLAN.md.
--
-- Same RLS posture as `rooms`: row level security is enabled with zero
-- policies, which blocks the anon/public key entirely. Only the
-- server-side service_role key (used in API routes, which bypasses RLS)
-- can read or write these tables.

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),

  -- The seam to the design half of the app: points at rooms.session_id.
  -- Deliberately NOT a foreign key. Posts outlive designs, and deleting a
  -- design should leave the post standing rather than cascade it away.
  session_id text not null,

  author_handle text not null,
  caption text,
  thumbnail_url text not null,
  created_at timestamptz not null default now(),

  -- Snapshot of the design AT PUBLISH TIME. Denormalized on purpose: the
  -- feed sorts and filters on these columns and must never join into
  -- rooms.layout jsonb to do it. It also means a post keeps showing what
  -- the design looked like when posted, even if the author rearranges it
  -- afterwards.
  room_type text not null,
  width_m real not null check (width_m > 0),
  length_m real not null check (length_m > 0),
  area_m2 real not null check (area_m2 > 0),
  style_tags text[] not null default '{}',
  -- Null until catalog bindings are saved onto layouts. The budget filter
  -- stays hidden while every row is null.
  total_budget_cents integer check (total_budget_cents is null or total_budget_cents >= 0),
  object_count integer not null default 0 check (object_count >= 0),

  -- Denormalized counter maintained on like/unlike, so a feed of 40 cards
  -- doesn't run 40 count(*) subqueries.
  like_count integer not null default 0 check (like_count >= 0)
);

create table if not exists post_likes (
  post_id uuid not null references posts(id) on delete cascade,

  -- A random id generated in the browser and kept in localStorage. Not an
  -- account — just enough that one person can't like the same post twice.
  device_id text not null,

  created_at timestamptz not null default now(),

  -- Composite key makes duplicate likes a constraint violation rather than
  -- something the application has to remember to check.
  primary key (post_id, device_id)
);

-- Newest-first feed, and the lower bound of each "top" time window.
create index if not exists posts_created_at_idx on posts (created_at desc);

-- All-time top, and the sort order within each window.
create index if not exists posts_like_count_idx on posts (like_count desc, created_at desc);

-- Filters.
create index if not exists posts_room_type_idx on posts (room_type);
create index if not exists posts_area_idx on posts (area_m2);
create index if not exists posts_style_tags_idx on posts using gin (style_tags);

alter table posts enable row level security;
alter table post_likes enable row level security;
