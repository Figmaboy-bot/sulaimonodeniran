// Page-view collector. The browser used to make two requests per view — one
// to /api/geo for the country, then a POST straight to Supabase — and both
// were cancelled if the visitor left quickly. Now it's a single beacon here;
// the country comes from Vercel's geo header and the insert happens server-side.
//
// When Supabase won't take the row — it returns 402 for the whole project once
// the free-tier egress quota is gone — the view is parked in R2 instead of
// being dropped. A non-2xx response doesn't throw, so the old catch here never
// fired and every view during the outage was lost silently. Replay the parked
// rows with scripts/import-analytics.py once the database is reachable again.

import { createHash, createHmac } from 'node:crypto';

const SUPABASE_URL      = 'https://axpgphfcjzhyoimxxwrz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cGdwaGZjanpoeW9pbXh4d3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1ODU0MjIsImV4cCI6MjA5MzE2MTQyMn0.sZSJA58Uqr67vNBTNin2SGi5jQlBhouVC1baofaVN-o';

const PENDING_PREFIX = 'analytics/pending/';

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

  const row = {
    page:     str(body.page, 500) || '/',
    referrer: str(body.referrer, 2000),
    country:  str(req.headers['x-vercel-ip-country'], 8)
  };

  let stored = false;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/page_views', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(4000)
    });
    stored = r.ok;   // 402 and friends are not exceptions — check explicitly
  } catch (e) {
    stored = false;
  }

  if (!stored) {
    try {
      // created_at is set by the database on a normal insert; park it on the
      // row here so a replayed view keeps the time it actually happened.
      const parked = Object.assign({}, row, { created_at: new Date().toISOString() });
      const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
        .filter(function (n) { return !env(n); });
      if (missing.length) {
        console.error('[track] cannot park view, missing env:', missing.join(','));
      } else if (!(await putToR2(pendingKey(parked), JSON.stringify(parked)))) {
        console.error('[track] view dropped for', parked.page);
      }
    } catch (e) {
      // analytics must never surface as an error to the visitor
      console.error('[track] park threw', String(e && e.message || e).slice(0, 200));
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(204).end();
}
