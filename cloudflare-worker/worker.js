// Caching reverse proxy in front of this project's media.
//
// Migration in progress: files that have been copied into the R2 bucket
// (binding: MEDIA, see wrangler.toml) are served from there — R2 reads
// through a Worker binding cost zero Cloudflare egress, and never touch
// Supabase at all. Anything not yet migrated still falls back to Supabase
// Storage so nothing breaks mid-migration; run scripts/migrate-to-r2.py to
// move the rest, then this fallback stops being exercised.
//
// Only forwards GET/HEAD requests under the public object path, so it can't
// be used as an open proxy to the rest of the Supabase project.
var SUPABASE_ORIGIN   = 'https://axpgphfcjzhyoimxxwrz.supabase.co';
var ALLOWED_PREFIX    = '/storage/v1/object/public/';
var CACHE_TTL_SECONDS = 31536000; // 1 year — uploaded filenames are unique/immutable


function contentType(key) {
  var ext = (key.split('.').pop() || '').toLowerCase();
  return {
    webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', mov: 'video/quicktime',
    webm: 'video/webm'
  }[ext] || 'application/octet-stream';
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    if (!url.pathname.startsWith(ALLOWED_PREFIX)) {
      return new Response('Not found', { status: 404 });
    }

    // Always cache under a GET key: cache.put() rejects a HEAD request, and
    // a HEAD should be answered from whatever the GET already cached. The ?v=
    // the site appends (scripts/cdn.js) rides along in the URL, so re-encoding
    // an object in place retires every stale copy without a worker deploy.
    var cacheKey = new Request(url.toString(), { method: 'GET', headers: request.headers });

    var cache = caches.default;
    var cached = await cache.match(cacheKey);
    if (cached) return cached;

    // R2 key is everything after the public marker, e.g.
    // "projects/images/foo.webp" or "carousel/Portfolio Cover.jpg" —
    // decoded, since the URL segment arrives percent-encoded.
    var key = decodeURIComponent(url.pathname.slice(ALLOWED_PREFIX.length));

    var response;
    var object = env.MEDIA ? await env.MEDIA.get(key) : null;

    if (object) {
      var headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || contentType(key));
      headers.set('Cache-Control', 'public, max-age=' + CACHE_TTL_SECONDS + ', immutable');
      headers.set('Access-Control-Allow-Origin', '*');
      response = new Response(object.body, { headers: headers });
    } else {
      var originUrl = SUPABASE_ORIGIN + url.pathname + url.search;
      var originResponse = await fetch(originUrl, {
        cf: { cacheEverything: true, cacheTtl: CACHE_TTL_SECONDS }
      });
      if (!originResponse.ok) return originResponse;

      response = new Response(originResponse.body, originResponse);
      response.headers.set('Cache-Control', 'public, max-age=' + CACHE_TTL_SECONDS + ', immutable');
      response.headers.set('Access-Control-Allow-Origin', '*');
    }

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
};