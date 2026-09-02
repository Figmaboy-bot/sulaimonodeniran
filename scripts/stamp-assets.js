// Content-hash versioning for CSS and JS.
//
// The site has no bundler, so stylesheet and script files keep stable names
// and browsers had to revalidate every one of them on every visit. This script
// appends ?v=<hash of the file> to each local <link href> / <script src> in
// every HTML file. vercel.json then serves any .css/.js request that carries a
// ?v query with a one-year immutable cache, while unversioned requests keep
// the default revalidate-every-time behaviour. A file change produces a new
// hash and therefore a new URL, so nothing can be served stale.
//
// It rewrites the HTML in place, which is only wanted inside Vercel's build
// container (buildCommand in vercel.json). Locally it is a no-op unless you
// pass --force.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

if (!process.env.VERCEL && !process.argv.includes('--force')) {
  console.log('stamp-assets: not running on Vercel, leaving files untouched (pass --force to rewrite in place)');
  process.exit(0);
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', 'cloudflare-worker', 'netlify']);

function htmlFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

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

let fileCount = 0;
let refCount = 0;

for (const html of htmlFiles(ROOT, [])) {
  const dir = path.dirname(html);
  let touched = false;
  const out = fs.readFileSync(html, 'utf8').replace(REF, function (match, before, ref, after) {
    if (/^(?:[a-z]+:)?\/\//i.test(ref)) return match;          // external URL
    const file = ref.startsWith('/') ? path.join(ROOT, ref) : path.resolve(dir, ref);
    if (!fs.existsSync(file)) return match;
    touched = true;
    refCount++;
    return before + ref + '?v=' + hashOf(file) + after;
  });
  if (touched) {
    fs.writeFileSync(html, out);
    fileCount++;
  }
}

console.log('stamp-assets: versioned ' + refCount + ' references in ' + fileCount + ' HTML files');
