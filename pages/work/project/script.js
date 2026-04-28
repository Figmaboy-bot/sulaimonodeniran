(function () {

  // ── Load project data from URL ──────────────
  var id = new URLSearchParams(location.search).get('id');
  var project = PROJECTS && PROJECTS[id];

  if (!project) {
    location.replace('/pages/work/');
    return;
  }

  // ── Populate sidebar ────────────────────────
  document.title = project.title + ' — Ola';
  document.getElementById('project-title').textContent    = project.title;
  document.getElementById('project-tagline').textContent  = project.tagline;
  document.getElementById('project-about').textContent    = project.about;
  document.getElementById('project-industry').textContent = project.industry;
  document.getElementById('project-role').textContent     = project.role;
  document.getElementById('project-year').textContent     = project.year;

  // ── Build gallery ───────────────────────────
  var gallery = document.getElementById('project-gallery');

  function makeImg(src, alt, eager) {
    var wrap = document.createElement('div');
    wrap.className = 'gallery-img';
    var img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.loading = eager ? 'eager' : 'lazy';
    wrap.appendChild(img);
    return wrap;
  }

  project.gallery.forEach(function (section, i) {
    if (section.type === 'full') {
      var wrap = makeImg(section.src, section.alt, i === 0);
      wrap.classList.add('gallery-img--full');
      gallery.appendChild(wrap);
    } else if (section.type === 'pair') {
      var row = document.createElement('div');
      row.className = 'gallery-row';
      section.images.forEach(function (item) {
        row.appendChild(makeImg(item.src, item.alt, false));
      });
      gallery.appendChild(row);
    }
  });

  // ── Sidebar dock on scroll ──────────────────
  var sidebar = document.querySelector('.project-sidebar');
  var layout  = document.querySelector('.project-layout');

  function updateSidebar() {
    if (!sidebar || !layout) return;
    if (layout.getBoundingClientRect().bottom <= window.innerHeight) {
      sidebar.classList.add('is-docked');
    } else {
      sidebar.classList.remove('is-docked');
    }
  }

  window.addEventListener('scroll', updateSidebar, { passive: true });
  updateSidebar();

  // ── Back button exit ────────────────────────
  var backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var href = this.getAttribute('href');
      var g = document.getElementById('project-gallery');
      if (g) {
        g.style.transition = 'transform 0.45s cubic-bezier(0.76,0,0.24,1), opacity 0.35s ease';
        g.style.transform  = 'translateY(80px)';
        g.style.opacity    = '0';
      }
      document.body.style.transition = 'opacity 0.4s ease';
      document.body.style.opacity    = '0';
      setTimeout(function () { location.href = href; }, 440);
    });
  }

})();
