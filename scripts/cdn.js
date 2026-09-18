// Rewrites public Supabase Storage URLs to a Cloudflare Worker cache in front
// of the R2 bucket holding this site's media. Leave STORAGE_CDN_URL empty to
// serve storage files straight from Supabase.
var STORAGE_CDN_URL = 'https://portfolio-storage-cdn.sulaimonodeniran.workers.dev';

// Uploaded filenames are unique, so the Worker caches each object at the edge
// for a year. scripts/optimize-r2.py breaks that promise: it rewrites objects
// in place under their existing keys, and a warm POP will happily keep serving
// the old, heavy copy until the entry is evicted. The Worker keys its cache on
// the full URL, so bumping this retires every stale copy on the next deploy —
// no wrangler, no cache purge. Bump it after any in-place media rewrite.
var MEDIA_VERSION = 2;

function cdnUrl(url) {
  if (!STORAGE_CDN_URL || !url) return url;
  var marker = '/storage/v1/object/public/';
  var i = url.indexOf(marker);
  if (i === -1) return url;
  var out = STORAGE_CDN_URL + url.slice(i);
  return out + (out.indexOf('?') === -1 ? '?' : '&') + 'v=' + MEDIA_VERSION;
}
