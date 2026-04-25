function initNav() {
  const overlay    = document.getElementById('menu-overlay');
  const backdrop   = document.getElementById('nav-backdrop');
  const toggleBtn  = document.getElementById('menu-toggle');
  const hamburger  = document.getElementById('hamburger-icon');
  const closeIcon  = document.getElementById('close-icon');
  const menuLabel  = document.getElementById('menu-label');
  const themeBtns  = document.querySelectorAll('.nav-btn[aria-label="Toggle theme"]');

  if (!overlay || !toggleBtn) return;

  // Theme toggle
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

  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);

  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      applyTheme(isLight ? 'dark' : 'light');
    });
  });

  let isOpen = false;

  function openMenu() {
    isOpen = true;
    overlay.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-open');
    hamburger.style.display = 'none';
    closeIcon.style.display = 'flex';
    menuLabel.textContent = 'Close';
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    isOpen = false;
    overlay.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-open');
    hamburger.style.display = 'flex';
    closeIcon.style.display = 'none';
    menuLabel.textContent = 'Menu';
    document.body.style.overflow = '';
  }

  toggleBtn.addEventListener('click', () => isOpen ? closeMenu() : openMenu());

  if (backdrop) backdrop.addEventListener('click', closeMenu);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });
}
