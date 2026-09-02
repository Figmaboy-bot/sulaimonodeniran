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
  try {
    items = await sbSelect('playground_items', 'select=*&order=sort_order.asc');
  } catch (e) {}

  clearSkeletons();

  // ── Build grid ───────────────────────────────
  if (!items.length) {
    grid.innerHTML = '<p class="pg-empty">No items yet — add some in the admin panel.</p>';
  } else {
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className  = 'pg-item';
      card.dataset.id = item.id;

      card.innerHTML =
        '<div class="pg-image"><img class="pg-card-thumb" src="" alt="' + esc(item.title || '') + '" loading="lazy" decoding="async" /></div>' +
        '<div class="pg-info">' +
          '<p class="pg-title">' + esc(item.title       || '') + '</p>' +
          '<p class="pg-desc">'  + esc(item.description || '') + '</p>' +
        '</div>';

      if (item.cover_url) {
        card.querySelector('.pg-card-thumb').src = cdnUrl(item.cover_url);
      }

      grid.appendChild(card);
    });
  }

  // ── Modal ────────────────────────────────────
  var overlay   = document.getElementById('pg-modal-overlay');
  var mediaWrap = document.getElementById('pg-modal-media-wrap');
  var titleEl   = document.getElementById('pg-modal-title');
  var descEl    = document.getElementById('pg-modal-desc');
  var closeBtn  = document.getElementById('pg-modal-close');

  function openModal(item) {
    titleEl.textContent = item.title       || '';
    descEl.textContent  = item.description || '';

    var liveLinkEl = document.getElementById('pg-modal-live-link');
    if (item.live_url) {
      liveLinkEl.href          = item.live_url;
      liveLinkEl.style.display = '';
    } else {
      liveLinkEl.style.display = 'none';
    }

    mediaWrap.innerHTML = '';
    if (item.media_url) {
      var el;
      if (item.media_type === 'video') {
        el             = document.createElement('video');
        el.controls    = true;
        el.autoplay    = true;
        el.muted       = true;
        el.loop        = true;
        el.playsInline = true;
        el.className   = 'pg-modal-video';
        mediaWrap.appendChild(el);
        el.src = cdnUrl(item.media_url);
        el.load();
        el.play().catch(function () {});
      } else {
        el           = document.createElement('img');
        el.alt       = item.title || '';
        el.className = 'pg-modal-img';
        el.src       = cdnUrl(item.media_url);
        mediaWrap.appendChild(el);
      }
    }

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    var video = mediaWrap.querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    mediaWrap.innerHTML = '';
  }

  grid.addEventListener('click', function (e) {
    var card = e.target.closest('.pg-item');
    if (!card) return;
    var id   = card.dataset.id;
    var item = items.find(function (i) { return i.id === id; });
    if (item) openModal(item);
  });

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
