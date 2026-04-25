function initNav() {
  const overlay   = document.getElementById('menu-overlay');
  const toggleBtn = document.getElementById('menu-toggle');
  const menuLabel = document.getElementById('menu-label');
  const themeBtns = document.querySelectorAll('.nav-btn[aria-label="Toggle theme"]');

  if (!overlay || !toggleBtn) return;

  const SUN_ICON  = 'image/Icons/Sun.svg';
  const MOON_ICON = 'image/Icons/Moon.svg';

  function applyTheme(theme) {
    const isLight = theme === 'light';
    if (isLight) {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    themeBtns.forEach(btn => {
      const img = btn.querySelector('img');
      if (img) img.src = isLight ? MOON_ICON : SUN_ICON;
    });
    localStorage.setItem('theme', theme);
  }

  const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const saved = localStorage.getItem('theme') || systemTheme;
  applyTheme(saved);

  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      applyTheme(isLight ? 'dark' : 'light');
    });
  });

  // Measure the rendered pixel width of each character in a string,
  // matching the font of the target element exactly.
  function measureChars(el, text) {
    var probe = document.createElement('span');
    var cs = getComputedStyle(el);
    probe.style.cssText = [
      'position:absolute',
      'visibility:hidden',
      'white-space:nowrap',
      'font:' + cs.font,
      'letter-spacing:' + cs.letterSpacing,
    ].join(';');
    document.body.appendChild(probe);
    var widths = Array.prototype.map.call(text, function(ch) {
      probe.textContent = ch;
      return probe.getBoundingClientRect().width;
    });
    document.body.removeChild(probe);
    return widths;
  }

  // Typewriter: erase fills each removed letter with a · of that letter's width,
  // then typing replaces each · with the corresponding new letter.
  // Menu → Men· → Me·· → M··· → ···· → O··· → Op·· → Ope· → Open
  var typingTimer = null;

  function typeText(el, fromText, toText) {
    if (typingTimer) clearTimeout(typingTimer);
    var speed = 70;
    var fromW = measureChars(el, fromText);
    var toW   = measureChars(el, toText);
    var maxLen = Math.max(fromText.length, toText.length);

    // Returns the dot width for position k in each phase.
    // Erase phase: dot replaces a fromText character → use fromW.
    // Type phase:  dot will become a toText character → use toW.
    function dotWidth(k, phase) {
      if (phase === 'erase' && k < fromW.length) return fromW[k];
      return k < toW.length ? toW[k] : 8;
    }

    // Build innerHTML: plain text on the left, fixed-width dot spans on the right.
    function render(leftText, phase) {
      var html = leftText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/ /g, '&nbsp;');
      for (var k = leftText.length; k < maxLen; k++) {
        var w = dotWidth(k, phase).toFixed(2);
        html += '<span style="display:inline-block;width:' + w + 'px;text-align:center;font-weight:700">·</span>';
      }
      el.innerHTML = html;
    }

    var i = fromText.length;

    function erase() {
      i--;
      render(fromText.slice(0, i), 'erase');
      if (i > 0) {
        typingTimer = setTimeout(erase, speed);
      } else {
        var j = 0;
        function type() {
          j++;
          render(toText.slice(0, j), 'type');
          if (j < toText.length) {
            typingTimer = setTimeout(type, speed);
          }
        }
        typingTimer = setTimeout(type, speed);
      }
    }
    erase();
  }

  let isOpen = false;

  function openMenu() {
    isOpen = true;
    overlay.classList.add('is-open');
    typeText(menuLabel, 'Menu', 'Open');
  }

  function closeMenu() {
    isOpen = false;
    overlay.classList.remove('is-open');
    typeText(menuLabel, 'Open', 'Menu');
  }

  toggleBtn.addEventListener('click', () => isOpen ? closeMenu() : openMenu());

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeMenu();
  });
}
