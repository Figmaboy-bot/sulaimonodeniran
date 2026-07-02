// Rewrites public Supabase Storage URLs to a Cloudflare Worker cache in front
// of the bucket, cutting repeat egress against the Supabase bandwidth quota.
// Leave STORAGE_CDN_URL empty to serve storage files straight from Supabase.
var STORAGE_CDN_URL = 'https://portfolio-storage-cdn.sulaimonodeniran.workers.dev';

function cdnUrl(url) {
  if (!STORAGE_CDN_URL || !url) return url;
  var marker = '/storage/v1/object/public/';
  var i = url.indexOf(marker);
  if (i === -1) return url;
  return STORAGE_CDN_URL + url.slice(i);
}
