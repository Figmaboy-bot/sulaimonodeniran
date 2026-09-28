function initNav() {
  const themeBtns = document.querySelectorAll('.nav-theme');

  const SUN_ICON  = '/image/Icons/Sun.svg';
  const MOON_ICON = '/image/Icons/Moon.svg';

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
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', isLight ? '#f0eeeb' : '#1a1a1a');
    localStorage.setItem('theme', theme);
  }

  const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const saved = localStorage.getItem('theme') || systemTheme;
  applyTheme(saved);
  requestAnimationFrame(function () {
    document.body.classList.add('theme-ready');
  });

  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      applyTheme(isLight ? 'dark' : 'light');
    });
  });

  // Highlight the current page link
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(function(link) {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    if (!href) return;
    const isHome = href === '/' || href === '/index.html';
    if (isHome) {
      if (path === '/' || path === '/index.html') link.classList.add('active');
    } else {
      const base = href.replace(/\/$/, '');
      if (path === base || path === base + '/' || path.startsWith(base + '/')) {
        link.classList.add('active');
      }
    }
  });
}
