-- Comments, plus two columns on posts. Run once in the Supabase dashboard's
-- SQL Editor (Project > SQL Editor > paste > Run). See SOCIAL_INTEGRATION.md.
--
-- Same RLS posture as the rest of the social layer: enabled with zero
-- policies, so only the service_role key used in API routes can read or
-- write. All access goes through /api/posts/[id]/comments.

create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,

  author_handle text not null,

  -- The browser that wrote it. Not an account and not a secret — just
  -- enough that someone can delete their own comment without logging in.
  device_id text not null,

  body text not null check (char_length(body) between 1 and 500),

  -- Suppress a comment without destroying it. A public link with an open
  -- comment box needs some way to take something down, and there is no
  -- moderation UI to do it properly yet.
  hidden boolean not null default false,

  created_at timestamptz not null default now()
);

-- Oldest first within a post, which is the order a thread reads in.
create index if not exists post_comments_post_idx
  on post_comments (post_id, created_at asc);

alter table post_comments enable row level security;

-- Denormalized counter, recounted on write like posts.like_count, so a feed
-- of 24 cards doesn't run 24 count(*) subqueries.
alter table posts add column if not exists comment_count integer not null default 0;

-- A 3D capture of the design, when the editor starts producing one. Null
-- means fall back to the generated floor plan, so a design without a render
-- degrades instead of breaking.
alter table posts add column if not exists render_url text;
