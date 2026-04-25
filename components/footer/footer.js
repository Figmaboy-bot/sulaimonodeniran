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
