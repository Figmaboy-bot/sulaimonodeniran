function initSpotify() {
  const widget  = document.getElementById('spotify-widget');
  const disc    = document.getElementById('spotify-disc');
  const track   = document.getElementById('spotify-track');
  const artist  = document.getElementById('spotify-artist');

  if (!widget) return;

  const DEFAULT_DISC = '/image/vinyl-132.webp';

  function setIdle() {
    disc.src = DEFAULT_DISC;
    disc.classList.remove('playing');
    track.textContent  = 'Not Playing';
    track.title        = '';
    artist.textContent = '';
    artist.title       = '';
    widget.href = '#';
  }

  async function poll() {
    try {
      const res  = await fetch('/api/spotify');
      const data = await res.json();

      if (data.isPlaying) {
        if (disc.src !== data.albumArt) disc.src = data.albumArt || DEFAULT_DISC;
        disc.classList.add('playing');
        track.textContent  = data.title;
        artist.textContent = data.artist;
        // Both lines are truncated to one line in CSS, so keep the full text
        // reachable on hover.
        track.title        = data.title || '';
        artist.title       = data.artist || '';
        widget.href        = data.songUrl || '#';
      } else {
        setIdle();
      }
    } catch {
      setIdle();
    }
  }

  poll();
  setInterval(poll, 30000);
}

function startWATClock() {
  function tick() {
    const el = document.getElementById('wat-time');
    if (!el) return;
    const time = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos'
    });
    const [hh, mm] = time.split(':');
    el.innerHTML = `${hh}<span class="blink-colon">:</span>${mm} (WAT, GMT+1)`;
  }
  tick();
  setInterval(tick, 1000);
  initSpotify();
}
