// Page-view collector. The browser used to make two requests per view — one
// to /api/geo for the country, then a POST straight to Supabase — and both
// were cancelled if the visitor left quickly. Now it's a single beacon here;
// the country comes from Vercel's geo header and the insert happens server-side.

const SUPABASE_URL      = 'https://axpgphfcjzhyoimxxwrz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cGdwaGZjanpoeW9pbXh4d3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1ODU0MjIsImV4cCI6MjA5MzE2MTQyMn0.sZSJA58Uqr67vNBTNin2SGi5jQlBhouVC1baofaVN-o';

function str(value, max) {
  if (typeof value !== 'string' || !value) return null;
  return value.slice(0, max);
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

  try {
    await fetch(SUPABASE_URL + '/rest/v1/page_views', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });
  } catch (e) {
    // analytics must never surface as an error to the visitor
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(204).end();
}
