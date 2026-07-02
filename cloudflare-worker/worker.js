// Caching reverse proxy in front of this project's public Supabase Storage
// bucket. Only forwards GET/HEAD requests under the public object path, so
// it can't be used as an open proxy to the rest of the Supabase project.
var SUPABASE_ORIGIN  = 'https://axpgphfcjzhyoimxxwrz.supabase.co';
var ALLOWED_PREFIX   = '/storage/v1/object/public/';
var CACHE_TTL_SECONDS = 31536000; // 1 year — uploaded filenames are unique/immutable

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    if (!url.pathname.startsWith(ALLOWED_PREFIX)) {
      return new Response('Not found', { status: 404 });
    }

    var cache = caches.default;
    var cached = await cache.match(request);
    if (cached) return cached;

    var originUrl = SUPABASE_ORIGIN + url.pathname + url.search;
    var originResponse = await fetch(originUrl, {
      cf: { cacheEverything: true, cacheTtl: CACHE_TTL_SECONDS }
    });

    if (!originResponse.ok) return originResponse;

    var response = new Response(originResponse.body, originResponse);
    response.headers.set('Cache-Control', 'public, max-age=' + CACHE_TTL_SECONDS + ', immutable');
    response.headers.set('Access-Control-Allow-Origin', '*');

    ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  }
};
