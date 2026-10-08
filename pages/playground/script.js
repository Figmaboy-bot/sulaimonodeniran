(async function () {

  var grid = document.getElementById('playground-grid');
  if (!grid) return;

  // ── Skeletons ────────────────────────────────
  function showSkeletons(n) {
    for (var i = 0; i < n; i++) {
      var el = document.createElement('div');
      el.className = 'pg-item-skeleton';
      el.innerHTML =
        '<div class="sk sk-image"></div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<div class="sk sk-title"></div>' +
          '<div class="sk sk-desc"></div>' +
        '</div>';
      grid.appendChild(el);
    }
  }

  function clearSkeletons() {
    grid.querySelectorAll('.pg-item-skeleton').forEach(function (el) { el.remove(); });
  }

  // ── Load items ───────────────────────────────
  showSkeletons(8);

  var items = [];

  // ── Build grid ───────────────────────────────
  function renderGrid() {
    grid.innerHTML = '';

    if (!items.length) {
      grid.innerHTML = '<p class="pg-empty">No items yet — add some in the admin panel.</p>';
      return;
    }

    items.forEach(function (item) {
      var card = document.createElement('a');
      card.className  = 'pg-item';
      card.href       = '/pages/playground/item/?id=' + encodeURIComponent(item.id);

      card.innerHTML =
        '<div class="pg-image"><img class="pg-card-thumb" src="" alt="' + esc(item.title || '') + '" loading="lazy" decoding="async" /></div>' +
        '<div class="pg-info">' +
          '<p class="pg-title">' + esc(item.title       || '') + '</p>' +
          '<p class="pg-desc">'  + esc(item.description || '') + '</p>' +
        '</div>';

      if (item.cover_url) {
        card.querySelector('.pg-card-thumb').src = cdnUrl(item.cover_url);
      }

      // A video item plays in the card on hover, over its cover image. No src
      // until then, so the grid itself downloads only the covers.
      if (item.media_type === 'video' && item.media_url) {
        var v = document.createElement('video');
        v.className = 'pg-card-video';
        v.muted = true;
        v.loop  = true;
        v.playsInline = true;
        v.preload = 'none';
        v.setAttribute('aria-hidden', 'true');
        v.dataset.src = cdnUrl(item.media_url);
        // a frame picked in admin as the cover is where playback starts
        if (item.cover_time) v.dataset.start = Number(item.cover_time);
        // the cover stays up until playback has reached the cover frame
        v.addEventListener('timeupdate', function () {
          if (!v.paused && !v.seeking && v.currentTime >= startAt(v) - 0.1) v.classList.add('is-playing');
        });
        // if the seek never lands, show the video anyway rather than a still
        v.addEventListener('playing', function () {
          setTimeout(function () { if (!v.paused) v.classList.add('is-playing'); }, 1500);
        });
        card.querySelector('.pg-image').appendChild(v);
      }

      grid.appendChild(card);
    });
    wireVideos();
  }

  // ── Card videos ──────────────────────────────
  // Pointer devices play a card's video while it's hovered. Touch screens
  // have no hover, so they play the card that's mostly on screen, unless the
  // visitor asked for less motion or less data, in which case the cover
  // stays put. Same rules as the home page's cover videos.
  var canHover = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var calm     = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn     = navigator.connection;
  var lowData  = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));
  var viewObserver = null;

  function startAt(v) { return parseFloat(v.dataset.start) || 0; }

  // every play opens on the cover frame; not every browser honours '#t=',
  // so the first one seeks once the metadata is in as well
  function play(v) {
    if (!v.getAttribute('src')) {
      v.preload = 'auto';
      v.src = v.dataset.src + (startAt(v) ? '#t=' + startAt(v) : '');
      v.addEventListener('loadedmetadata', function () {
        if (Math.abs(v.currentTime - startAt(v)) > 0.1) v.currentTime = startAt(v);
      }, { once: true });
    } else {
      v.currentTime = startAt(v);
    }
    v.play().catch(function () {});
  }

  function stop(v) {
    v.pause();
    v.classList.remove('is-playing');
  }

  function wireVideos() {
    if (viewObserver) viewObserver.disconnect();
    var videos = grid.querySelectorAll('video.pg-card-video');
    if (!videos.length) return;

    if (!canHover) {
      if (calm || lowData || !('IntersectionObserver' in window)) return;
      viewObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) play(e.target); else stop(e.target);
        });
      }, { threshold: 0.6 });
      Array.prototype.forEach.call(videos, function (v) { viewObserver.observe(v); });
      return;
    }

    Array.prototype.forEach.call(videos, function (v) {
      var card = v.closest('.pg-item');
      card.addEventListener('mouseenter', function () { play(v); });
      card.addEventListener('mouseleave', function () { stop(v); });
    });
  }

  function onRefresh(rows) {
    items = rows;
    renderGrid();
  }

  try {
    items = await sbSelect('playground_items', 'select=*&order=sort_order.asc', onRefresh);
  } catch (e) {}

  clearSkeletons();
  renderGrid();

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
