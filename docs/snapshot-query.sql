-- Rebuilds data/snapshot.json when the REST API is unavailable but the
-- Supabase dashboard still works (e.g. the project is over its egress quota).
--
--   1. Supabase dashboard -> SQL Editor -> paste and run this
--   2. Copy the single result cell, save it to a file
--   3. node scripts/import-snapshot.js <that file>
--
-- Once the API is reachable again, `node scripts/snapshot.js` replaces all of
-- the above.

select json_build_object(
  'projects',          (select coalesce(json_agg(t order by t.sort_order), '[]'::json) from projects t),
  'playground_items',  (select coalesce(json_agg(t order by t.sort_order), '[]'::json) from playground_items t),
  'carousel_images',   (select coalesce(json_agg(t order by t.sort_order), '[]'::json) from carousel_images t),
  'carousel_settings', (select coalesce(json_agg(t), '[]'::json) from carousel_settings t)
) as snapshot;
