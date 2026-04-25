function initSpotify() {
  const widget  = document.getElementById('spotify-widget');
  const disc    = document.getElementById('spotify-disc');
  const track   = document.getElementById('spotify-track');
  const artist  = document.getElementById('spotify-artist');

  if (!widget) return;

  const DEFAULT_DISC = '/image/vinyl-record-2026-03-09-05-44-56-utc (1).jpg';

  function setIdle() {
    disc.src = DEFAULT_DISC;
    disc.classList.remove('playing');
    track.textContent  = 'Not Playing';
    artist.textContent = '';
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
    el.innerHTML = `${hh} <span class="blink-colon">:</span> ${mm} (WAT, GMT+1)`;
  }
  tick();
  setInterval(tick, 1000);
  initFooterHeading();
  initSpotify();
}

function initFooterHeading() {
  const heading = document.querySelector('.footer-heading');
  if (!heading) return;

  const text = heading.textContent.trim();
  const chars = [...text];

  const wrap = document.createElement('div');
  wrap.className = 'footer-heading-wrap';
  wrap.setAttribute('aria-label', text);

  function buildLayer(cls) {
    const h2 = document.createElement('h2');
    h2.className = 'footer-heading ' + cls;
    h2.setAttribute('aria-hidden', 'true');

    chars.forEach(function(char, i) {
      const charWrap = document.createElement('span');
      charWrap.className = 'char-wrap';

      const charSpan = document.createElement('span');
      charSpan.className = 'char';
      charSpan.style.setProperty('--i', i);
      charSpan.textContent = char === ' ' ? ' ' : char;

      charWrap.appendChild(charSpan);
      h2.appendChild(charWrap);
    });

    return h2;
  }

  wrap.appendChild(buildLayer('footer-heading--out'));
  wrap.appendChild(buildLayer('footer-heading--in'));
  heading.replaceWith(wrap);
}
