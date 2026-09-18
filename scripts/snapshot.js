// Pulls the four public tables out of Supabase into data/snapshot.json, the
// copy the site paints from before (and instead of, when Supabase is down)
// talking to the database. See scripts/sb.js for how it's consumed.
//
//   node scripts/snapshot.js            → rewrite data/snapshot.json
//   node scripts/snapshot.js --check    → exit 1 if the snapshot is stale
//
// Needs the REST API to be reachable. While the project is over its egress
// quota this will fail; use scripts/import-snapshot.js with a SQL Editor
// export instead, which only needs the dashboard.

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'data', 'snapshot.json');

// Same four tables scripts/sb.js is asked for, with the widest query each page
// issues — the snapshot stores whole tables and filters client-side.
const TABLES = {
  projects:          'select=*&order=sort_order.asc',
  playground_items:  'select=*&order=sort_order.asc',
  carousel_images:   'select=*&order=sort_order.asc',
  carousel_settings: 'select=*'
};

function config() {
  const src = fs.readFileSync(path.join(ROOT, 'supabase-config.js'), 'utf8');
  const url = /SUPABASE_URL\s*=\s*'([^']+)'/.exec(src);
  const key = /SUPABASE_ANON_KEY\s*=\s*'([^']+)'/.exec(src);
  if (!url || !key) throw new Error('Could not parse supabase-config.js');
  return { url: url[1], key: key[1] };
}

async function fetchTable(cfg, table, params) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${table}: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

(async function () {
  const check = process.argv.includes('--check');
  const cfg = config();

  const snapshot = {};
  for (const [table, params] of Object.entries(TABLES)) {
    snapshot[table] = await fetchTable(cfg, table, params);
    console.log(`  ${table}: ${snapshot[table].length} rows`);
  }

  const next = JSON.stringify(snapshot, null, 2) + '\n';
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

  if (check) {
    if (next === prev) { console.log('snapshot is current'); return; }
    console.error('snapshot is stale — run `node scripts/snapshot.js` and commit');
    process.exit(1);
  }

  fs.writeFileSync(OUT, next);
  console.log(next === prev ? 'snapshot unchanged' : `wrote ${path.relative(ROOT, OUT)}`);
})().catch(function (err) {
  console.error('snapshot failed:', err.message);
  process.exit(1);
});
