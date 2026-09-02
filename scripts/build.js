// Build step for Vercel (vercel.json → buildCommand). Zero dependencies.
//
// Copies just the public site into dist/ and, on the way, appends
// ?v=<content hash> to every local <link href="…css"> and <script src="…js">
// in the HTML. vercel.json serves any .css/.js request carrying ?v with a
// one-year immutable cache; unversioned requests keep the default
// revalidate-every-time behaviour, so nothing can ever be served stale.
// A change to a file produces a new hash and therefore a new URL.
//
// Building into dist/ (rather than rewriting in place) also keeps the
// function sources in api/, the Cloudflare worker, and local tooling out of
// the static deployment, where they used to be publicly downloadable.
//
//   node scripts/build.js        → writes dist/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'dist');

// What the browser can request. Everything else stays out of the deployment.
const INCLUDE = [
  'index.html',
  'portfolio.css',
  'supabase-config.js',
  'components',
  'pages',
  'data',
  'admin',
  'image',
  'fonts',
  'scripts'
];
const EXCLUDE = new Set([
  'scripts/build.js',
  'scripts/get-spotify-token.js',
  'scripts/backfill-images.py',
  '.DS_Store'
]);

const hashes = new Map();
function hashOf(file) {
  if (!hashes.has(file)) {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    hashes.set(file, digest.slice(0, 10));
  }
  return hashes.get(file);
}

// <link … href="x.css"> and <script … src="x.js">, local paths only
const REF = /(<(?:link|script)\b[^>]*?\b(?:href|src)=")([^"?#]+\.(?:css|js))("[^>]*>)/g;

let refCount = 0;
function stamp(html, fromDir) {
  return html.replace(REF, function (match, before, ref, after) {
    if (/^(?:[a-z]+:)?\/\//i.test(ref)) return match;          // external URL
    const file = ref.startsWith('/') ? path.join(ROOT, ref) : path.resolve(fromDir, ref);
    if (!fs.existsSync(file)) return match;
    refCount++;
    return before + ref + '?v=' + hashOf(file) + after;
  });
}

let fileCount = 0;
function copy(rel) {
  if (EXCLUDE.has(rel) || EXCLUDE.has(path.basename(rel))) return;
  const src = path.join(ROOT, rel);
  const dest = path.join(OUT, rel);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(src)) copy(path.join(rel, name));
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (rel.endsWith('.html')) {
    fs.writeFileSync(dest, stamp(fs.readFileSync(src, 'utf8'), path.dirname(src)));
  } else {
    fs.copyFileSync(src, dest);
  }
  fileCount++;
}

fs.rmSync(OUT, { recursive: true, force: true });
INCLUDE.forEach(copy);
console.log('build: copied ' + fileCount + ' files to dist/, versioned ' + refCount + ' stylesheet/script references');
