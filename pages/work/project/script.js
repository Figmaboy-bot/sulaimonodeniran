(function () {

  // ── Resolve the project ─────────────────────
  // Prefer the copy /api/project.js embedded server-side: it means a link
  // shared cold — no prior visit to /pages/work/ to warm the cache — renders
  // straight away instead of bouncing back to the index.
  var id = new URLSearchParams(location.search).get('id');

  function fromServer() {
    return (window.__PROJECT__ && window.__PROJECT__.id === id) ? window.__PROJECT__ : null;
  }

  function fromCache() {
    var source = typeof PROJECTS !== 'undefined' ? PROJECTS : null;
    try {
      var stored = localStorage.getItem('portfolio_projects');
      if (stored) source = JSON.parse(stored);
    } catch (e) {}
    return (source && source[id]) || null;
  }

  // Last resort: the server render was skipped (local static preview, or the
  // function errored) and this browser has never loaded the work index.
  function fromSupabase() {
    if (typeof SUPABASE_URL === 'undefined' || !id) return Promise.resolve(null);
    return fetch(SUPABASE_URL + '/rest/v1/projects?select=*&limit=1&id=eq.' + encodeURIComponent(id), {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return (rows && rows[0]) || null; })
      .catch(function () { return null; });
  }

  var project = fromServer() || fromCache();

  if (project) {
    render(project);
  } else {
    fromSupabase().then(function (p) {
      if (p) render(p);
      else location.replace('/pages/work/');
    });
  }

  function render(project) {

    // ── Populate sidebar ────────────────────────
    document.title = project.title + ' — Ola';
    document.getElementById('project-title').textContent    = project.title;
    var aboutEl   = document.getElementById('project-about');
    var toggleBtn = document.getElementById('about-toggle');
    aboutEl.textContent = project.about;

    var shortScreen = window.matchMedia('(max-height: 960px)');

    function syncAboutCollapse() {
      if (shortScreen.matches) {
        aboutEl.classList.add('is-collapsed');
        var overflows = aboutEl.scrollHeight > aboutEl.clientHeight + 2;
        toggleBtn.style.display = overflows ? '' : 'none';
        if (!overflows) aboutEl.classList.remove('is-collapsed');
      } else {
        aboutEl.classList.remove('is-collapsed');
        toggleBtn.style.display = 'none';
        toggleBtn.querySelector('span').textContent = 'View more';
        toggleBtn.classList.remove('is-expanded');
      }
    }

    toggleBtn.addEventListener('click', function () {
      var collapsed = aboutEl.classList.toggle('is-collapsed');
      toggleBtn.querySelector('span').textContent = collapsed ? 'View more' : 'Show less';
      toggleBtn.classList.toggle('is-expanded', !collapsed);
    });

    syncAboutCollapse();
    shortScreen.addEventListener('change', syncAboutCollapse);
    document.getElementById('project-industry').textContent = project.industry;
    document.getElementById('project-role').textContent     = project.role;
    document.getElementById('project-year').textContent     = project.year;

    var liveBtn = document.getElementById('btn-live');
    var liveUrl = project.live_url || project.liveUrl;
    if (liveUrl) {
      liveBtn.href          = liveUrl;
      liveBtn.style.display = '';
    }

    // ── Build gallery ───────────────────────────
    var gallery = document.getElementById('project-gallery');

    var SVG_PAUSE   = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    var SVG_PLAY    = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>';
    var SVG_VOL_OFF = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
    var SVG_VOL_ON  = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';

    function makeMedia(mediaType, alt, eager, w, h) {
      var wrap = document.createElement('div');
      wrap.className = 'gallery-img';
      var el;
      if (mediaType === 'video') {
        el = document.createElement('video');
        el.autoplay = true;
        el.muted    = true;
        el.loop     = true;
        el.setAttribute('playsinline', '');
        el.setAttribute('preload', 'auto');
      } else {
        el = document.createElement('img');
        el.alt      = alt;
        el.loading  = eager ? 'eager' : 'lazy';
        el.decoding = 'async';
        // the cover is the largest contentful paint — fetch it ahead of the rest
        if (eager) el.setAttribute('fetchpriority', 'high');
      }
      // intrinsic size reserves the block's height before the bytes land, so the
      // gallery no longer reflows from a stack of blank white panels
      if (w && h) {
        el.setAttribute('width', w);
        el.setAttribute('height', h);
      }
      wrap.appendChild(el);

      if (mediaType === 'video') {
        var controls     = document.createElement('div');
        controls.className = 'video-controls';

        var playBtn      = document.createElement('button');
        playBtn.className = 'vc-btn vc-play-pause';
        playBtn.setAttribute('aria-label', 'Pause');
        playBtn.innerHTML = SVG_PAUSE;

        var progressWrap = document.createElement('div');
        progressWrap.className = 'vc-progress';
        var progressFill = document.createElement('div');
        progressFill.className = 'vc-progress-fill';
        progressWrap.appendChild(progressFill);

        var muteBtn      = document.createElement('button');
        muteBtn.className = 'vc-btn vc-mute';
        muteBtn.setAttribute('aria-label', 'Unmute');
        muteBtn.innerHTML = SVG_VOL_OFF;

        controls.appendChild(playBtn);
        controls.appendChild(progressWrap);
        controls.appendChild(muteBtn);
        wrap.appendChild(controls);

        playBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (el.paused) {
            el.play();
            playBtn.innerHTML = SVG_PAUSE;
            playBtn.setAttribute('aria-label', 'Pause');
          } else {
            el.pause();
            playBtn.innerHTML = SVG_PLAY;
            playBtn.setAttribute('aria-label', 'Play');
          }
        });

        muteBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          el.muted = !el.muted;
          muteBtn.innerHTML = el.muted ? SVG_VOL_OFF : SVG_VOL_ON;
          muteBtn.setAttribute('aria-label', el.muted ? 'Unmute' : 'Mute');
        });

        el.addEventListener('timeupdate', function () {
          if (el.duration) {
            progressFill.style.width = (el.currentTime / el.duration * 100) + '%';
          }
        });

        progressWrap.addEventListener('click', function (e) {
          e.stopPropagation();
          var rect = progressWrap.getBoundingClientRect();
          var pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          if (el.duration) el.currentTime = pct * el.duration;
        });
      }

      return wrap;
    }

    function resolveMedia(el, imageId, src) {
      // cdnUrl() puts the Cloudflare cache in front of Supabase Storage; without
      // it every visit re-downloads the whole gallery (Supabase sends no-cache).
      var url = typeof cdnUrl === 'function' ? cdnUrl(src) : src;
      if (imageId) {
        ImageDB.get(imageId).then(function (rec) {
          if (rec) el.src = rec.dataUrl;
          else if (url) el.src = url;
        }).catch(function () { if (url) el.src = url; });
      } else if (url) {
        el.src = url;
      }
    }

    (project.gallery || []).forEach(function (section, i) {
      if (section.type === 'full') {
        var wrap = makeMedia(section.mediaType || 'image', section.alt || '', i === 0, section.w, section.h);
        if (i === 0) wrap.classList.add('gallery-img--full'); // only cover gets fixed height
        resolveMedia(wrap.firstChild, section.imageId, section.src);
        gallery.appendChild(wrap);
      } else if (section.type === 'pair') {
        var row = document.createElement('div');
        row.className = 'gallery-row';
        (section.images || []).forEach(function (item) {
          var w = makeMedia(item.mediaType || 'image', item.alt || '', false, item.w, item.h);
          resolveMedia(w.firstChild, item.imageId, item.src);
          row.appendChild(w);
        });
        gallery.appendChild(row);
      }
    });

    // ── Sidebar dock on scroll ──────────────────
    var sidebar = document.querySelector('.project-sidebar');
    var layout  = document.querySelector('.project-layout');

    // docking only applies while the sidebar is a fixed column (desktop);
    // below 768px it sits in normal flow above the gallery
    var canDock = window.matchMedia('(min-width: 769px)');

    function updateSidebar() {
      if (!sidebar || !layout) return;
      if (canDock.matches && layout.getBoundingClientRect().bottom <= window.innerHeight) {
        sidebar.classList.add('is-docked');
      } else {
        sidebar.classList.remove('is-docked');
      }
    }

    window.addEventListener('scroll', updateSidebar, { passive: true });
    canDock.addEventListener('change', updateSidebar);
    updateSidebar();

    // ── Back button exit ────────────────────────
    var backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
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

  }

})();
