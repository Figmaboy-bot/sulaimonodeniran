// Runs the site on this Mac with an admin that saves into the repo instead of
// Supabase. For when Supabase is unreachable (over quota, paused) — or whenever
// editing locally is simply easier.
//
//   node scripts/admin-local.js        then open http://127.0.0.1:4173/admin/
//
// Saving a project writes data/snapshot.json, the copy every public page
// renders from, and new uploads land in image/uploads/. The repo's usual
// commit-and-push then ships both, so the live site updates without Supabase.
//
// Only projects go through here for now; the other admin tabs still talk to
// Supabase. Supabase itself is left untouched — once it's back, bring it in
// line with the snapshot before running `node scripts/snapshot.js`, which
// would otherwise overwrite these edits with the database's older rows.
//
// Listens on 127.0.0.1 only: the admin password is checked in the browser,
// so nothing here should ever be reachable from another machine.

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const SNAPSHOT = path.join(ROOT, 'data', 'snapshot.json');
const UPLOADS  = path.join(ROOT, 'image', 'uploads');
const PORT     = Number(process.env.PORT) || 4173;
const HOST     = '127.0.0.1';

const TABLES = new Set(['projects']);
// GitHub refuses files over 100 MB; stay well clear so a push never jams
const MAX_UPLOAD = 50 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
  '.mov':  'video/quicktime',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};
const UPLOAD_EXT = new Set(['webp', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'mp4', 'mov', 'webm']);

function readSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
}

// Same layout as the committed file (2-space indent, trailing newline), so a
// save only shows the fields that actually changed in the diff. Written to a
// temp file first: a crash mid-write must not leave half a snapshot behind.
function writeSnapshot(snap) {
  const tmp = SNAPSHOT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(snap, null, 2) + '\n');
  fs.renameSync(tmp, SNAPSHOT);
}

function bySortOrder(a, b) {
  const x = a.sort_order, y = b.sort_order;
  if (x === y) return 0;
  if (x === null || x === undefined) return 1;
  if (y === null || y === undefined) return -1;
  return x - y;
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('File too large — max 50 MB'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  return JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString('utf8') || '{}');
}

function table(snap, name) {
  if (!TABLES.has(name)) throw Object.assign(new Error('Unknown table: ' + name), { status: 400 });
  if (!Array.isArray(snap[name])) snap[name] = [];
  return snap[name];
}

// Merges each row into the one with the same id (or appends it), like a
// PostgREST upsert, so a partial row such as { id, sort_order } only moves it.
function upsert(body) {
  const snap = readSnapshot();
  const rows = table(snap, body.table);
  (body.rows || []).forEach((row) => {
    if (!row || !row.id) return;
    const at = rows.findIndex((r) => String(r.id) === String(row.id));
    if (at === -1) rows.push(row);
    else rows[at] = Object.assign({}, rows[at], row);
  });
  rows.sort(bySortOrder);
  writeSnapshot(snap);
  return { ok: true };
}

function remove(body) {
  const snap = readSnapshot();
  const rows = table(snap, body.table);
  snap[body.table] = rows.filter((r) => String(r.id) !== String(body.id));
  writeSnapshot(snap);
  return { ok: true };
}

async function upload(req, url) {
  const folder = (url.searchParams.get('folder') || 'images').replace(/[^a-z0-9_-]/gi, '') || 'images';
  const ext    = (url.searchParams.get('ext') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!UPLOAD_EXT.has(ext)) throw Object.assign(new Error('Unsupported file type: .' + ext), { status: 400 });
  const data = await readBody(req, MAX_UPLOAD);
  const dir  = path.join(UPLOADS, folder);
  fs.mkdirSync(dir, { recursive: true });
  const name = Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
  fs.writeFileSync(path.join(dir, name), data);
  return { url: '/image/uploads/' + folder + '/' + name };
}

// Only ever deletes inside image/uploads/ — never anything else in the repo.
function removeFile(body) {
  const rel = String(body.url || '');
  if (!rel.startsWith('/image/uploads/')) return { ok: true };
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(UPLOADS + path.sep)) return { ok: true };
  try { fs.unlinkSync(file); } catch (e) {}
  return { ok: true };
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);

  // data/snapshot.js is a build artefact (gitignored); render it from the
  // JSON on every request so the admin and pages always see the latest save.
  if (rel === '/data/snapshot.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    res.end('var PORTFOLIO_SNAPSHOT = ' + JSON.stringify(readSnapshot()) + ';\n');
    return;
  }

  let file = path.resolve(ROOT, '.' + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    const index = path.join(file, 'index.html');
    // the project page ships as template.html; production serves it via /api/project.js
    const template = path.join(file, 'template.html');
    file = fs.existsSync(index) ? index : template;
  }
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + HOST);
  try {
    if (url.pathname.startsWith('/api/local/')) {
      const route = req.method + ' ' + url.pathname.slice('/api/local/'.length);
      if (route === 'GET ping')         return send(res, 200, { ok: true });
      if (route === 'POST upsert')      return send(res, 200, upsert(await readJson(req)));
      if (route === 'POST delete')      return send(res, 200, remove(await readJson(req)));
      if (route === 'POST upload')      return send(res, 200, await upload(req, url));
      if (route === 'POST remove-file') return send(res, 200, removeFile(await readJson(req)));
      return send(res, 404, { error: 'Unknown route' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    serveStatic(req, res, url);
  } catch (e) {
    send(res, e.status || 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log('Local admin: http://' + HOST + ':' + PORT + '/admin/');
  console.log('Saves go to data/snapshot.json and image/uploads/ — Ctrl+C to stop.');
});
