/**
 * Run this ONCE locally to get your Spotify refresh token.
 *
 *   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/get-spotify-token.js
 *
 * Then paste the printed env vars into your Netlify site settings → Environment variables.
 */

const http = require('http');
const { parse } = require('url');

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI  = 'http://127.0.0.1:3000/callback';
const SCOPES        = 'user-read-currently-playing user-read-playback-state';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET before running.');
  process.exit(1);
}

const authUrl =
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT_URI, scope: SCOPES });

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl + '\n');

const server = http.createServer(async (req, res) => {
  const { pathname, query } = parse(req.url, true);
  if (pathname !== '/callback' || !query.code) return;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2 style="font-family:sans-serif">Done — check your terminal.</h2>');

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: query.code, redirect_uri: REDIRECT_URI }),
  });

  const data = await tokenRes.json();
  if (!data.refresh_token) {
    console.error('\nSpotify error:', data);
    server.close();
    return;
  }

  console.log('\n✅ Add these to Netlify → Site settings → Environment variables:\n');
  console.log(`SPOTIFY_CLIENT_ID=${CLIENT_ID}`);
  console.log(`SPOTIFY_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}`);
  console.log();
  server.close();
});

server.listen(3000, () => console.log('Waiting for Spotify callback on http://localhost:3000 …\n'));
