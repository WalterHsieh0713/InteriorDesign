-- One-time schema change for the 3D thumbnail feature. Run this once in the
-- Supabase dashboard's SQL Editor (Project > SQL Editor > paste > Run).
--
-- Mirrors `posts.render_url` (see create-comments-table.sql): a captured
-- isometric screenshot of the room, taken from the same camera angle the
-- editor opens with. Null until the room is shared at least once, same
-- fallback-to-2D-plan behavior as posts.render_url.

alter table rooms add column if not exists render_url text;
