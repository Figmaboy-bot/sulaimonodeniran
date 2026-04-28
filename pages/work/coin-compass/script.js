(function () {

  // ── Sidebar dock on scroll ──────────────────
  var sidebar = document.querySelector('.project-sidebar');
  var layout  = document.querySelector('.project-layout');

  function updateSidebar() {
    if (!sidebar || !layout) return;
    var layoutBottom = layout.getBoundingClientRect().bottom;
    if (layoutBottom <= window.innerHeight) {
      sidebar.classList.add('is-docked');
    } else {
      sidebar.classList.remove('is-docked');
    }
  }

  window.addEventListener('scroll', updateSidebar, { passive: true });
  updateSidebar();

  // ── Back button exit ────────────────────────
  var backBtn = document.querySelector('.project-back');
  if (!backBtn) return;

  backBtn.addEventListener('click', function (e) {
    e.preventDefault();
    var href = this.getAttribute('href');

    var gallery = document.querySelector('.project-gallery');
    if (gallery) {
      gallery.style.transition = 'transform 0.45s cubic-bezier(0.76, 0, 0.24, 1), opacity 0.35s ease';
      gallery.style.transform = 'translateY(80px)';
      gallery.style.opacity = '0';
    }
    document.body.style.transition = 'opacity 0.4s ease';
    document.body.style.opacity = '0';

    setTimeout(function () { location.href = href; }, 440);
  });

})();
