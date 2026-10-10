-- npx wrangler d1 execute portfolio-analytics --remote --file=schema.sql
--
-- id is text so every source can supply its own stable key: a UUID from the
-- tracker, "sb-<id>" for rows copied out of Supabase, the object name for
-- views parked in R2. INSERT OR IGNORE on it makes every import re-runnable.
-- created_at is an ISO-8601 UTC string (toISOString), which sorts and
-- compares correctly as plain text.
CREATE TABLE IF NOT EXISTS page_views (
  id         TEXT PRIMARY KEY,
  page       TEXT NOT NULL,
  referrer   TEXT,
  ref_host   TEXT NOT NULL DEFAULT '',
  country    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS page_views_created_at ON page_views (created_at);
