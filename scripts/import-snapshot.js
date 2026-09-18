// Builds data/snapshot.json from a Supabase SQL Editor export, for when the
// REST API is unavailable (over quota, paused project) but the dashboard still
// works. Once the API is reachable again, `node scripts/snapshot.js` does the
// same job without the copy-paste.
//
// In the dashboard SQL Editor run the query in docs/snapshot-query.sql, copy
// the result, save it to a file, then:
//
//   node scripts/import-snapshot.js ~/Downloads/export.json
//
// Accepts whatever shape the editor hands back: the bare object, the single
// {"snapshot": {...}} row, the [{...}] array the "Copy as JSON" button
// produces, or the one-cell CSV that "Download CSV" writes.
//
// Quote the path — the dashboard's filenames contain spaces.

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const OUT    = path.join(ROOT, 'data', 'snapshot.json');
const TABLES = ['projects', 'playground_items', 'carousel_images', 'carousel_settings'];

// "Download CSV" writes a header line and one quoted cell holding the whole
// JSON document, with every internal quote doubled per RFC 4180.
function fromCsv(text) {
  const nl = text.indexOf('\n');
  let cell = (nl === -1 ? '' : text.slice(nl + 1)).trim();
  if (cell.startsWith('"')) {
    const end = cell.lastIndexOf('"');
    cell = cell.slice(1, end === 0 ? undefined : end).replace(/""/g, '"');
  }
  return cell;
}

function parseExport(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    const cell = fromCsv(raw);
    if (!cell) throw e;
    return JSON.parse(cell);
  }
}

function unwrap(parsed) {
  let value = parsed;
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new Error(`expected a single result row, got ${value.length}`);
    }
    value = value[0];
  }
  // A one-column row such as {"snapshot": {...}} — unwrap it.
  if (value && typeof value === 'object' && !TABLES.some(t => t in value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) value = value[keys[0]];
  }
  if (typeof value === 'string') value = JSON.parse(value);
  return value;
}

const file = process.argv[2];
if (!file || process.argv.length > 3) {
  console.error('usage: node scripts/import-snapshot.js "<export.csv|.json>"');
  if (process.argv.length > 3) {
    console.error('(got ' + (process.argv.length - 2) + ' arguments — quote the path, it has spaces in it)');
  }
  process.exit(1);
}

let snapshot;
try {
  snapshot = unwrap(parseExport(fs.readFileSync(file, 'utf8')));
} catch (err) {
  console.error('could not read the export:', err.message);
  process.exit(1);
}

if (!snapshot || typeof snapshot !== 'object') {
  console.error('the export did not contain an object of tables');
  process.exit(1);
}

const missing = TABLES.filter(t => !Array.isArray(snapshot[t]));
if (missing.length) {
  console.error(`the export is missing these tables (or they aren't arrays): ${missing.join(', ')}`);
  console.error('run the full query in docs/snapshot-query.sql');
  process.exit(1);
}

// Keep the key order stable so diffs stay readable.
const ordered = {};
for (const t of TABLES) ordered[t] = snapshot[t];

fs.writeFileSync(OUT, JSON.stringify(ordered, null, 2) + '\n');
for (const t of TABLES) console.log(`  ${t}: ${ordered[t].length} rows`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
