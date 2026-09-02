// Minimal PostgREST reader for the public pages.
//
// The site only ever *reads* a handful of tables from the browser, and the
// full supabase-js bundle (≈213 KB, 55 KB gzipped) was being downloaded and
// parsed on every page just to issue those SELECTs. A plain fetch against the
// REST endpoint does the same job for ~0 KB. The admin panel still uses
// supabase-js for auth and uploads.
//
//   sbSelect('projects', 'select=*&order=sort_order.asc').then(function (rows) { … })
//
// Resolves with the JSON array PostgREST returns; rejects on a non-2xx status.
function sbSelect(table, params) {
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
