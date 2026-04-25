const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_ENDPOINT = 'https://api.spotify.com/v1/me/player/currently-playing';

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;

async function getAccessToken() {
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
  });
  const data = await res.json();
  return data.access_token;
}

exports.handler = async function () {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const token = await getAccessToken();
    const res = await fetch(NOW_PLAYING_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 204 = nothing playing
    if (res.status === 204) {
      return { statusCode: 200, headers, body: JSON.stringify({ isPlaying: false }) };
    }

    const song = await res.json();

    if (!song.is_playing || song.currently_playing_type !== 'track') {
      return { statusCode: 200, headers, body: JSON.stringify({ isPlaying: false }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        isPlaying: true,
        title: song.item.name,
        artist: song.item.artists.map((a) => a.name).join(', '),
        albumArt: (song.item.album.images[1] ?? song.item.album.images[0])?.url,
        songUrl: song.item.external_urls.spotify,
      }),
    };
  } catch {
    return { statusCode: 200, headers, body: JSON.stringify({ isPlaying: false }) };
  }
};
