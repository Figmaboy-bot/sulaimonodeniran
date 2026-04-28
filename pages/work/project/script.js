(function () {

  // ── Load project data from URL ──────────────
  // Check localStorage first (set by admin dashboard), fallback to static file
  var id = new URLSearchParams(location.search).get('id');
  var source = PROJECTS;
  try {
    var stored = localStorage.getItem('portfolio_projects');
    if (stored) source = JSON.parse(stored);
  } catch (e) {}
  var project = source && source[id];

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

  function makeImg(alt, eager) {
    var wrap = document.createElement('div');
    wrap.className = 'gallery-img';
    var img = document.createElement('img');
    img.alt     = alt;
    img.loading = eager ? 'eager' : 'lazy';
    wrap.appendChild(img);
    return wrap;
  }

  function resolveImg(imgEl, imageId, src) {
    if (imageId) {
      ImageDB.get(imageId).then(function (rec) {
        if (rec) imgEl.src = rec.dataUrl;
        else if (src) imgEl.src = src;
      }).catch(function () { if (src) imgEl.src = src; });
    } else if (src) {
      imgEl.src = src;
    }
  }

  project.gallery.forEach(function (section, i) {
    if (section.type === 'full') {
      var wrap = makeImg(section.alt || '', i === 0);
      wrap.classList.add('gallery-img--full');
      resolveImg(wrap.querySelector('img'), section.imageId, section.src);
      gallery.appendChild(wrap);
    } else if (section.type === 'pair') {
      var row = document.createElement('div');
      row.className = 'gallery-row';
      (section.images || []).forEach(function (item) {
        var w = makeImg(item.alt || '', false);
        resolveImg(w.querySelector('img'), item.imageId, item.src);
        row.appendChild(w);
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
