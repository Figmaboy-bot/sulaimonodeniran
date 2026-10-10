// Page-view collector. The browser sends one beacon here per page load; the
// country comes from Vercel's geo header and the row goes to the analytics
// Worker (cloudflare-worker/analytics), which stores it in Cloudflare D1.
// Supabase is no longer involved: its free-tier quota kept refusing writes
// and, with them, every view during the outage.
//
// If the Worker can't take the row, the view is parked in R2 instead of being
// dropped. Replay parked rows with scripts/import-analytics.py; each carries
// the id it would have been stored under, so a replay can't double-count.
//
// Needs, in the Vercel project's environment:
//   ANALYTICS_INGEST_URL     https://portfolio-analytics.<subdomain>.workers.dev/ingest
//   ANALYTICS_INGEST_SECRET  same value as the Worker's INGEST_SECRET
//   R2_*                     for parking, as before

import { createHash, createHmac, randomUUID } from 'node:crypto';

const PENDING_PREFIX = 'analytics/pending/';

// The tracker only runs once a page's scripts do, so plain crawlers never get
// here; what does arrive is headless browsers, audits and uptime checks, which
// would otherwise count as visitors. No user agent at all is treated the same.
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|curl|wget|python|axios|node-fetch|go-http|java\//i;

function isBot(ua) {
  return !ua || BOT_UA.test(ua);
}

function str(value, max) {
  if (typeof value !== 'string' || !value) return null;
  return value.slice(0, max);
}

// ── R2 (S3 API, SigV4) ───────────────────────────────────────────────────────
// Signed by hand: this project has no package.json, so there's no aws-sdk to
// reach for, and a single PUT needs very little of one.

function hmac(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256hex(data) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

// Every segment encoded, but the separators kept — S3 signs the path this way.
function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

// Trimmed, always: a value pasted or piped in with padding produces a host
// like "abc123   .r2.cloudflarestorage.com", which fetch rejects outright —
// and a padded secret silently breaks the signature instead, which is worse.
function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

async function putToR2(key, body) {
  const account = env('R2_ACCOUNT_ID');
  const access  = env('R2_ACCESS_KEY_ID');
  const secret  = env('R2_SECRET_ACCESS_KEY');
  const bucket  = env('R2_BUCKET');
  if (!account || !access || !secret || !bucket) return false;

  const host   = account + '.r2.cloudflarestorage.com';
  const region = 'auto';
  const now    = new Date();
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, '');  // 20260920T203000Z
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);

  const canonicalUri = '/' + bucket + '/' + encodeKey(key);
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    'host:' + host,
    'x-amz-content-sha256:' + payloadHash,
    'x-amz-date:' + amzDate,
    '',
    signedHeaders,
    payloadHash
  ].join('\n');

  const scope = [dateStamp, region, 's3', 'aws4_request'].join('/');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest)
  ].join('\n');

  const signing = hmac(hmac(hmac(hmac('AWS4' + secret, dateStamp), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signing).update(stringToSign, 'utf8').digest('hex');

  const res = await fetch('https://' + host + canonicalUri, {
    method: 'PUT',
    headers: {
      Host: host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Content-Type': 'application/json',
      Authorization: 'AWS4-HMAC-SHA256 Credential=' + access + '/' + scope +
        ', SignedHeaders=' + signedHeaders + ', Signature=' + signature
    },
    body,
    signal: AbortSignal.timeout(4000)
  });

  if (!res.ok) {
    // Swallowing this is what let the original data loss go unnoticed for
    // days. It stays non-fatal for the visitor, but it must leave a trace.
    const detail = await res.text().catch(() => '');
    console.error('[track] R2 put failed', res.status, detail.slice(0, 300));
  }
  return res.ok;
}

// One object per view. R2 can't append, and a read-modify-write would race
// between concurrent visitors; small objects sidestep both. Writes are Class A
// operations, which a portfolio's traffic won't come close to exhausting.
function pendingKey(row) {
  const iso = row.created_at;
  const rand = Math.random().toString(36).slice(2, 10);
  return PENDING_PREFIX + iso.slice(0, 10) + '/' + iso.replace(/[:.]/g, '-') + '-' + rand + '.json';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  // sendBeacon posts a JSON blob; Vercel parses it when the content-type is
  // application/json, but be tolerant of a raw string body too.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  res.setHeader('Cache-Control', 'no-store');
  if (isBot(req.headers['user-agent'])) return res.status(204).end();

  // id and time are fixed here, not by the database, so a view that ends up
  // parked and replayed later keeps both and lands exactly once.
  const row = {
    id:         randomUUID(),
    page:       str(body.page, 500) || '/',
    referrer:   str(body.referrer, 2000),
    country:    str(req.headers['x-vercel-ip-country'], 8),
    created_at: new Date().toISOString()
  };

  let stored = false;
  const ingestUrl = env('ANALYTICS_INGEST_URL');
  const ingestSecret = env('ANALYTICS_INGEST_SECRET');
  if (!ingestUrl || !ingestSecret) {
    console.error('[track] analytics worker not configured, parking view');
  } else {
    try {
      const r = await fetch(ingestUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + ingestSecret,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(4000)
      });
      stored = r.ok;   // a non-2xx is not an exception — check explicitly
      if (!stored) console.error('[track] analytics worker refused view', r.status);
    } catch (e) {
      stored = false;
    }
  }

  if (!stored) {
    try {
      const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
        .filter(function (n) { return !env(n); });
      if (missing.length) {
        console.error('[track] cannot park view, missing env:', missing.join(','));
      } else if (!(await putToR2(pendingKey(row), JSON.stringify(row)))) {
        console.error('[track] view dropped for', row.page);
      }
    } catch (e) {
      // analytics must never surface as an error to the visitor
      console.error('[track] park threw', String(e && e.message || e).slice(0, 200));
    }
  }

  return res.status(204).end();
}
