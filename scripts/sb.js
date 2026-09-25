// Snapshot-first reader for the public pages.
//
// The site used to issue a PostgREST request on every page load just to paint,
// which made a working portfolio contingent on Supabase being up and inside its
// free-tier quota. When the quota ran out the whole site rendered empty — not
// just the images, but every project, carousel slide and playground item.
//
// So the four public tables now ship with the build. scripts/snapshot.js writes
// them to data/snapshot.json; scripts/build.js emits that as data/snapshot.js,
// which each page loads into PORTFOLIO_SNAPSHOT before this file runs. sbSelect
// answers from the snapshot synchronously, then — only when the caller passes
// an onRefresh callback — revalidates against Supabase in the background and
// hands back fresher rows if anything actually changed. A failed revalidation
// is silent: the visitor keeps the snapshot and never sees an empty page.
//
//   sbSelect('projects', 'select=*&order=sort_order.asc', render).then(render)
//
// Refresh the snapshot with `node scripts/snapshot.js` (needs Supabase up).

// The slice of PostgREST syntax the public pages actually use: eq. filters,
// a single order, and limit. `select` is ignored — the snapshot carries every
// column and handing a caller extra ones is harmless.
function sbApplyParams(rows, params) {
  var out = rows.slice();
  var limit = null;

  (params || '').split('&').forEach(function (part) {
    var eq = part.indexOf('=');
    if (eq === -1) return;
    var key = decodeURIComponent(part.slice(0, eq));
    var val = decodeURIComponent(part.slice(eq + 1));

    if (key === 'select') return;
    if (key === 'limit') { limit = parseInt(val, 10); return; }

    if (key === 'order') {
      var bits = val.split('.');
      var col  = bits[0];
      var dir  = bits[1] === 'desc' ? -1 : 1;
      out.sort(function (a, b) {
        var x = a[col], y = b[col];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;   // nulls last, either way
        if (y === null || y === undefined) return -1;
        return (x > y ? 1 : -1) * dir;
      });
      return;
    }

    if (val.indexOf('eq.') === 0) {
      var want = val.slice(3);
      out = out.filter(function (r) { return String(r[key]) === want; });
    }
  });

  return limit === null ? out : out.slice(0, limit);
}

function sbSnapshotTable(table) {
  var snap = typeof PORTFOLIO_SNAPSHOT !== 'undefined' ? PORTFOLIO_SNAPSHOT : null;
  return (snap && snap[table]) || [];
}

// Compares only the columns Supabase actually returned, so a `select=url,crop`
// response doesn't read as "changed" merely because the snapshot row is wider.
function sbSameRows(live, local) {
  if (live.length !== local.length) return false;
  var keys = Object.keys(live[0] || {});
  for (var i = 0; i < live.length; i++) {
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var a = live[i][key];
      var b = local[i] ? local[i][key] : undefined;
      if (JSON.stringify(a) !== JSON.stringify(b)) return false;
    }
  }
  return true;
}

function sbFetchLive(table, params) {
  if (typeof SUPABASE_URL !== 'string' || !SUPABASE_URL) {
    return Promise.reject(new Error('Supabase not configured'));
  }
  return fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + params, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      Accept: 'application/json'
    }
  }).then(function (r) {
    if (!r.ok) throw new Error('Supabase responded ' + r.status);
    return r.json();
  });
}

// Resolves with the snapshot rows straight away. onRefresh, when given, may be
// called once more with live rows if Supabase is reachable and has newer data.
//
// Projects are edited in the admin's local mode, which writes the snapshot and
// never Supabase, so Supabase holds an older copy of them. Revalidating would
// swap that stale copy over the published one, so projects skip it. The
// carousel images now ship as optimised local files in the snapshot, so the
// carousel skips it too.
var SB_SNAPSHOT_ONLY = ['projects', 'carousel_images', 'carousel_settings'];

function sbSelect(table, params, onRefresh) {
  var local = sbApplyParams(sbSnapshotTable(table), params);
  if (SB_SNAPSHOT_ONLY.indexOf(table) !== -1) onRefresh = null;

  // Nothing in the snapshot for this table yet: wait on Supabase like before,
  // so a half-filled snapshot degrades to the old behaviour instead of a blank.
  if (!local.length) return sbFetchLive(table, params);

  if (typeof onRefresh === 'function') {
    sbFetchLive(table, params)
      .then(function (rows) {
        if (rows && rows.length && !sbSameRows(rows, local)) onRefresh(rows);
      })
      .catch(function () { /* snapshot stands */ });
  }

  return Promise.resolve(local);
}
