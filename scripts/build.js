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
  'favicon.ico',
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
  'scripts/snapshot.js',
  'scripts/import-snapshot.js',
  'scripts/admin-local.js',
  'scripts/get-spotify-token.js',
  'scripts/backfill-images.py',
  'scripts/migrate-to-r2.py',
  'scripts/optimize-r2.py',
  'scripts/import-analytics.py',
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

// data/snapshot.json is the committed copy of the four public tables (see
// scripts/snapshot.js). Ship it as a script rather than something the page has
// to fetch: it lands with the HTML, and the ?v= stamping below gives it an
// immutable URL that changes the moment the data does.
const SNAPSHOT_JSON = path.join(ROOT, 'data', 'snapshot.json');
const SNAPSHOT_JS   = path.join(ROOT, 'data', 'snapshot.js');
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_JSON, 'utf8'));
fs.writeFileSync(SNAPSHOT_JS, 'var PORTFOLIO_SNAPSHOT = ' + JSON.stringify(snapshot) + ';\n');
const rowCounts = Object.keys(snapshot)
  .map(function (t) { return t + '=' + snapshot[t].length; })
  .join(' ');

fs.rmSync(OUT, { recursive: true, force: true });
INCLUDE.forEach(copy);

// Each page's largest paint is an image the browser only learns about once a
// script has built the page: the first Work card's cover, and the first
// carousel cards on Home and About. Preload them from the <head>. The URL
// rewrite mirrors scripts/cdn.js (MEDIA_VERSION included) so it hits the same
// cache entry the page then asks for.
function mediaUrl(url) {
  const marker = '/storage/v1/object/public/';
  const i = url.indexOf(marker);
  return i === -1 ? url : 'https://portfolio-storage-cdn.sulaimonodeniran.workers.dev' + url.slice(i) + '?v=2';
}
function preloadImages(page, urls) {
  const file = path.join(OUT, page);
  const tags = urls.filter(Boolean).map(function (u) {
    return '  <link rel="preload" as="image" href="' + mediaUrl(u).replace(/"/g, '&quot;') + '" fetchpriority="high">\n';
  }).join('');
  if (tags) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('</head>', tags + '</head>'));
}
const bySort = function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); };
const firstProject = (snapshot.projects || []).slice().sort(bySort)[0];
preloadImages('pages/work/index.html', [firstProject && firstProject.cover_url]);
// carousel.js loads the first three cards eagerly; those are the ones on screen
function carouselFirst(page) {
  return (snapshot.carousel_images || []).filter(function (r) { return r.page === page; })
    .sort(bySort).slice(0, 3).map(function (r) { return r.url; });
}
preloadImages('index.html', carouselFirst('home'));
preloadImages('pages/about/index.html', carouselFirst('about'));

// Search engines: the project pages are only linked from script-rendered
// cards, so the sitemap lists them outright. Coming-soon projects stay out
// until they have a case study.
const SITE = 'https://www.sulaimonodeniran.com';
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sitemapUrls = ['/', '/pages/work/', '/pages/about/', '/pages/playground/', '/pages/articles/']
  .concat((snapshot.projects || [])
    .filter(function (p) { return p.id && !p.coming_soon; })
    .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
    .map(function (p) { return '/pages/work/project/?id=' + encodeURIComponent(p.id); }));
fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapUrls.map(function (u) { return '  <url><loc>' + xmlEsc(SITE + u) + '</loc></url>'; }).join('\n') +
  '\n</urlset>\n');
fs.writeFileSync(path.join(OUT, 'robots.txt'),
  // /admin/ is kept out by its noindex tag; blocking it here would stop
  // crawlers from ever reading that tag
  'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');
console.log('build: sitemap.xml with ' + sitemapUrls.length + ' URLs, robots.txt');
console.log('build: copied ' + fileCount + ' files to dist/, versioned ' + refCount + ' stylesheet/script references');
console.log('build: snapshot rows ' + rowCounts);
