// Page-view store for the portfolio, on Cloudflare D1 (binding: DB). Replaces
// the Supabase page_views table, whose free-tier quota kept taking analytics
// down: when it ran out, writes were refused and the admin couldn't read at all.
//
//   POST /ingest  Bearer INGEST_SECRET  one view, or an array of up to 400
//                 (api/track.js sends one per page load; the import scripts
//                 send batches)
//   GET  /stats   Bearer STATS_TOKEN    ?from=<ISO>&today=<ISO>
//                 totals and breakdowns for the admin's Analytics tab, counted
//                 in SQL — nothing is capped at 1000 rows any more
//
// The admin password is only checked in the browser, so it protects nothing
// here; STATS_TOKEN is what keeps the numbers private.

// D1 allows 100 bound parameters per statement and, on the free plan, 50
// queries per invocation. Six columns -> 16 rows per INSERT, and 400 rows is
// 25 statements, comfortably inside both.
var MAX_BATCH      = 400;
var ROWS_PER_QUERY = 16;

// The admin calls /stats straight from the browser, both live and from
// scripts/admin-local.js. The token is the real gate; this just keeps other
// sites' pages from reading the response.
function allowedOrigin(origin) {
  if (!origin) return null;
  if (/^https:\/\/(www\.)?sulaimonodeniran\.com$/.test(origin)) return origin;
  if (/^https:\/\/sulaimonodeniran-[a-z0-9-]+-olas-projects-f37eee99\.vercel\.app$/.test(origin)) return origin;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function json(body, status, origin) {
  var headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body), { status: status || 200, headers: headers });
}

// Hashed first so the comparison is constant-time and the lengths always match,
// which timingSafeEqual requires.
async function tokenMatches(request, expected) {
  if (!expected) return false;
  var got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  var enc = new TextEncoder();
  var a = await crypto.subtle.digest('SHA-256', enc.encode(got));
  var b = await crypto.subtle.digest('SHA-256', enc.encode(expected));
  return crypto.subtle.timingSafeEqual(a, b);
}

function str(value, max) {
  if (typeof value !== 'string' || !value) return null;
  return value.slice(0, max);
}

function refHost(referrer) {
  if (!referrer) return '';
  try { return new URL(referrer).hostname.replace(/^www\./, ''); } catch (e) { return referrer.slice(0, 200); }
}

// -> a clean row, or null when there's nothing usable in it
function normalise(input) {
  if (!input || typeof input !== 'object') return null;
  var page = str(input.page, 500);
  if (!page) return null;
  var t = new Date(input.created_at || Date.now());
  if (isNaN(t.getTime())) return null;
  var referrer = str(input.referrer, 2000);
  return {
    id:         str(input.id, 200) || crypto.randomUUID(),
    page:       page,
    referrer:   referrer,
    ref_host:   refHost(referrer),
    country:    (str(input.country, 8) || '').toUpperCase(),
    created_at: t.toISOString()
  };
}

async function ingest(request, env) {
  if (!(await tokenMatches(request, env.INGEST_SECRET))) return json({ error: 'unauthorised' }, 401);

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  var list = Array.isArray(body) ? body : [body];
  if (list.length > MAX_BATCH) return json({ error: 'batch over ' + MAX_BATCH }, 413);

  var rows = list.map(normalise).filter(Boolean);
  if (!rows.length) return json({ inserted: 0, skipped: list.length });

  // OR IGNORE: a row whose id is already stored is a re-run import, not an error.
  var stmts = [];
  for (var i = 0; i < rows.length; i += ROWS_PER_QUERY) {
    var chunk = rows.slice(i, i + ROWS_PER_QUERY);
    var params = [];
    chunk.forEach(function (r) { params.push(r.id, r.page, r.referrer, r.ref_host, r.country, r.created_at); });
    stmts.push(env.DB.prepare(
      'INSERT OR IGNORE INTO page_views (id, page, referrer, ref_host, country, created_at) VALUES ' +
      chunk.map(function () { return '(?, ?, ?, ?, ?, ?)'; }).join(', ')
    ).bind(...params));
  }
  var results = await env.DB.batch(stmts);
  var inserted = results.reduce(function (n, r) { return n + (r.meta && r.meta.changes || 0); }, 0);
  return json({ inserted: inserted, skipped: list.length - inserted });
}

// "Today" is the admin's local midnight, so the browser sends it rather than
// the worker guessing a timezone. An empty `from` means all time: every ISO
// string sorts after ''.
function isoParam(url, name) {
  var v = url.searchParams.get(name);
  if (!v) return '';
  var t = new Date(v);
  return isNaN(t.getTime()) ? '' : t.toISOString();
}

async function stats(request, env, origin) {
  if (!(await tokenMatches(request, env.STATS_TOKEN))) return json({ error: 'unauthorised' }, 401, origin);

  var url   = new URL(request.url);
  var from  = isoParam(url, 'from');
  var today = isoParam(url, 'today') || new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();

  var results = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS total, SUM(created_at >= ?2) AS today FROM page_views WHERE created_at >= ?1')
      .bind(from, today),
    env.DB.prepare('SELECT page, COUNT(*) AS count, MAX(created_at) AS last_seen FROM page_views WHERE created_at >= ?1 GROUP BY page ORDER BY count DESC, page')
      .bind(from),
    env.DB.prepare('SELECT ref_host AS ref, COUNT(*) AS count FROM page_views WHERE created_at >= ?1 GROUP BY ref_host ORDER BY count DESC, ref_host')
      .bind(from),
    env.DB.prepare('SELECT country, COUNT(*) AS count FROM page_views WHERE created_at >= ?1 GROUP BY country ORDER BY count DESC, country')
      .bind(from)
  ]);

  var totals = results[0].results[0] || {};
  return json({
    total:     totals.total || 0,
    today:     totals.today || 0,
    pages:     results[1].results,
    referrers: results[2].results,
    countries: results[3].results
  }, 200, origin);
}

export default {
  async fetch(request, env) {
    var url    = new URL(request.url);
    var origin = allowedOrigin(request.headers.get('Origin'));

    if (request.method === 'OPTIONS' && url.pathname === '/stats') {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  origin,
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Authorization',
          'Access-Control-Max-Age':       '86400',
          'Vary': 'Origin'
        }
      });
    }

    try {
      if (request.method === 'POST' && url.pathname === '/ingest') return await ingest(request, env);
      if (request.method === 'GET'  && url.pathname === '/stats')  return await stats(request, env, origin);
    } catch (e) {
      console.error('[analytics]', url.pathname, String(e && e.message || e).slice(0, 300));
      return json({ error: 'server error' }, 500, origin);
    }
    return json({ error: 'not found' }, 404, origin);
  }
};
