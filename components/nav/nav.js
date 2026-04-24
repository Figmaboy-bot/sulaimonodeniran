function initNav() {
  const overlay      = document.getElementById('menu-overlay');
  const toggleBtn    = document.getElementById('menu-toggle');
  const hamburger    = document.getElementById('hamburger-icon');
  const closeIcon    = document.getElementById('close-icon');
  const menuLabel    = document.getElementById('menu-label');

  if (!overlay || !toggleBtn) return;

  let isOpen = false;

  function openMenu() {
    isOpen = true;
    overlay.classList.add('is-open');
    hamburger.style.display = 'none';
    closeIcon.style.display = 'flex';
    menuLabel.textContent = 'Close';
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    isOpen = false;
    overlay.classList.remove('is-open');
    hamburger.style.display = 'flex';
    closeIcon.style.display = 'none';
    menuLabel.textContent = 'Menu';
    document.body.style.overflow = '';
  }

  toggleBtn.addEventListener('click', () => isOpen ? closeMenu() : openMenu());

  document.addEventListener('click', function (e) {
    if (isOpen && !overlay.contains(e.target)) closeMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });
}
