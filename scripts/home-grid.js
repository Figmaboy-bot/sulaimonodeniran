(function () {

  var grid = document.getElementById('case-grid');
  if (!grid) return;

  // Rows of three cards. Each row mixes a narrow, a wide and a flexible card,
  // in the order the design staggers them.
  var ROW_PATTERNS = [
    ['s', 'f', 'l'],
    ['f', 'l', 's'],
    ['l', 's', 'f'],
    ['s', 'l', 'f']
  ];

  // ── Skeletons ────────────────────────────────
  function showSkeletons() {
    var row = document.createElement('div');
    row.className = 'case-row case-row--skeleton';
    ROW_PATTERNS[0].forEach(function (size) {
      row.insertAdjacentHTML('beforeend',
        '<div class="case-card case-card--' + size + '">' +
          '<div class="sk case-card-img"></div>' +
          '<div class="case-card-text">' +
            '<div class="sk sk-title"></div>' +
            '<div class="sk sk-role"></div>' +
          '</div>' +
        '</div>');
    });
    grid.appendChild(row);
  }

  // ── Render ───────────────────────────────────
  function coverSrc(p) {
    if (p.cover_url) return p.cover_url;
    if (p.coverSrc)  return p.coverSrc;
    if (p.cardImg)   return p.cardImg;
    var first = (p.gallery || []).find(function (s) {
      return s.type === 'full' ? s.src : (s.images && s.images[0] && s.images[0].src);
    });
    if (!first) return '';
    return first.type === 'full' ? first.src : first.images[0].src;
  }

  // A cover can be a gallery video. Its gallery entry carries the poster frame
  // admin captured when it was starred; older entries without one fall back to
  // the extension check and show the video's own first frame.
  var VIDEO_EXT = /\.(mp4|webm|mov)(?:[?#]|$)/i;

  function coverItem(p, src) {
    var hit = null;
    (p.gallery || []).some(function (s) {
      (s.type === 'full' ? [s] : (s.images || [])).some(function (m) {
        if (m.src === src) hit = m;
        return hit;
      });
      return hit;
    });
    return hit;
  }

  function coverHtml(p, index) {
    var src  = coverSrc(p);
    var item = coverItem(p, src);
    var isVideo = item ? item.mediaType === 'video' : VIDEO_EXT.test(src);
    var alt  = esc(p.title || '');
    if (!isVideo) {
      // the first row sits just below the hero; build.js preloads it
      return '<img src="' + esc(cdnUrl(src)) + '" alt="' + alt + '" decoding="async"' +
        (index < 3 ? ' loading="eager"' : ' loading="lazy"') + ' />';
    }
    // No src until wireVideos decides to fetch it: the card paints from the
    // poster alone, and the video only downloads on hover (or in view on touch).
    var poster = item && item.poster ? ' poster="' + esc(cdnUrl(item.poster)) + '"' : '';
    // a frame picked in admin as the cover is also where playback starts
    var start  = item && item.posterTime ? ' data-start="' + Number(item.posterTime) + '"' : '';
    // While the video loads, the browser paints its first frame, not the
    // cover frame; this copy of the poster sits on top until playback has
    // actually reached the cover frame.
    var cover  = start && item.poster
      ? '<img class="case-card-poster" src="' + esc(cdnUrl(item.poster)) + '" alt="" aria-hidden="true" decoding="async" />'
      : '';
    return '<video class="case-card-video" muted loop playsinline preload="none" aria-label="' + alt + '"' +
      ' data-src="' + esc(cdnUrl(src)) + '"' + poster + start + '></video>' + cover;
  }

  function card(p, size, index) {
    var href = '/pages/work/project/?id=' + encodeURIComponent(p.id);
    return '<a class="case-card case-card--' + size + '" href="' + esc(href) + '">' +
        '<div class="case-card-img">' +
          coverHtml(p, index) +
        '</div>' +
        '<div class="case-card-text">' +
          '<h3 class="case-card-title">' + esc(p.title || '') + '</h3>' +
          '<p class="case-card-role">' + esc(p.role || '') + '</p>' +
        '</div>' +
      '</a>';
  }

  function render(projects) {
    // coming-soon projects stay off the page until they have a case study
    projects = projects.filter(function (p) { return !p.coming_soon; });
    grid.innerHTML = '';
    for (var i = 0; i < projects.length; i += 3) {
      var pattern = ROW_PATTERNS[(i / 3) % ROW_PATTERNS.length];
      var row = document.createElement('div');
      row.className = 'case-row';
      row.innerHTML = projects.slice(i, i + 3).map(function (p, j) {
        return card(p, pattern[j], i + j);
      }).join('');
      grid.appendChild(row);
    }
    wireVideos();
  }

  // ── Cover videos ─────────────────────────────
  // Pointer devices play a cover only while it's hovered or focused. Touch
  // screens have no hover, so they play the card that's mostly on screen,
  // unless the visitor asked for less motion or less data, in which case the
  // poster stays put.
  var canHover = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var calm     = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn     = navigator.connection;
  var lowData  = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));
  var viewObserver = null;
  var frameObserver = null;

  function startAt(v) { return parseFloat(v.dataset.start) || 0; }

  function fetchVideo(v, firstFrameOnly) {
    if (v.getAttribute('src')) return;
    // '#t=0.001' makes Safari paint a frame for a poster-less video too; a
    // picked cover frame opens playback on that frame instead
    v.preload = firstFrameOnly ? 'metadata' : 'auto';
    v.src = v.dataset.src + (firstFrameOnly ? '#t=0.001' : startAt(v) ? '#t=' + startAt(v) : '');
    if (!firstFrameOnly && startAt(v)) holdCover(v);
  }

  // Keeps the poster copy up until playback is at the cover frame. Not every
  // browser honours '#t=', so the seek is made here too.
  function holdCover(v) {
    var start = startAt(v);
    var cover = v.parentNode.querySelector('.case-card-poster');
    v.addEventListener('loadedmetadata', function () {
      if (Math.abs(v.currentTime - start) > 0.1) v.currentTime = start;
    }, { once: true });
    if (!cover) return;
    function reveal() {
      cover.classList.add('is-done');
      v.removeEventListener('timeupdate', reached);
    }
    function reached() {
      if (!v.seeking && v.currentTime >= start - 0.1) reveal();
    }
    v.addEventListener('timeupdate', reached);
    // if the seek never lands, show the video anyway rather than a still
    v.addEventListener('playing', function () { setTimeout(reveal, 1500); }, { once: true });
  }

  // every play opens on the cover frame, not wherever the last one stopped
  function play(v) {
    if (v.getAttribute('src')) v.currentTime = startAt(v);
    else fetchVideo(v, false);
    v.play().catch(function () {});
  }
  function stop(v)  { v.pause(); }
  // back to the cover frame, so the card matches its poster again
  function rewind(v) { stop(v); if (v.getAttribute('src')) v.currentTime = startAt(v); }

  function wireVideos() {
    if (viewObserver)  viewObserver.disconnect();
    if (frameObserver) frameObserver.disconnect();
    var videos = grid.querySelectorAll('video.case-card-video');
    if (!videos.length || !('IntersectionObserver' in window)) return;

    // Without a poster the card would sit blank, so fetch just enough to show
    // a frame once it nears the screen.
    frameObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        fetchVideo(e.target, true);
        frameObserver.unobserve(e.target);
      });
    }, { rootMargin: '200px 0px' });

    if (!canHover && !calm && !lowData) {
      viewObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) play(e.target); else rewind(e.target);
        });
      }, { threshold: 0.6 });
    }

    Array.prototype.forEach.call(videos, function (v) {
      if (!v.poster) frameObserver.observe(v);
      if (viewObserver) { viewObserver.observe(v); return; }
      if (!canHover) return;
      var link = v.closest('.case-card');
      link.addEventListener('mouseenter', function () { play(v); });
      link.addEventListener('focus',      function () { play(v); });
      link.addEventListener('mouseleave', function () { rewind(v); });
      link.addEventListener('blur',       function () { rewind(v); });
    });
  }

  function fromStatic() {
    var source = typeof PROJECTS !== 'undefined' ? PROJECTS : {};
    return Object.keys(source).map(function (id) { return Object.assign({ id: id }, source[id]); });
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Fetch ────────────────────────────────────
  showSkeletons();

  function show(rows) {
    if (rows && rows.length) {
      render(rows);
      // project pages read this copy first (pages/work/project/script.js)
      var cache = {};
      rows.forEach(function (p) { cache[p.id] = p; });
      try { localStorage.setItem('portfolio_projects', JSON.stringify(cache)); } catch (e) {}
    } else {
      render(fromStatic());
    }
  }

  sbSelect('projects', 'select=*&order=sort_order.asc', show)
    .then(show)
    .catch(function () { render(fromStatic()); });

})();
