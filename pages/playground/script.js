(function () {

  var PG_KEY = 'portfolio_playground';

  var items = [];
  try {
    var stored = localStorage.getItem(PG_KEY);
    if (stored) items = JSON.parse(stored);
  } catch (e) {}

  var grid = document.getElementById('playground-grid');
  if (!grid) return;

  // ── Build grid ─────────────────────────────────────────────────────────────

  if (!items.length) {
    grid.innerHTML = '<p class="pg-empty">No items yet — add some in the admin panel.</p>';
  } else {
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className         = 'pg-item';
      card.dataset.id        = item.id;
      card.dataset.title     = item.title     || '';
      card.dataset.desc      = item.desc      || '';
      card.dataset.mediaType = item.mediaType || 'image';

      card.innerHTML =
        '<div class="pg-image"><img class="pg-card-thumb" src="" alt="' + esc(item.title || '') + '" loading="lazy" /></div>' +
        '<div class="pg-info">' +
          '<p class="pg-title">' + esc(item.title || '') + '</p>' +
          '<p class="pg-desc">'  + esc(item.desc  || '') + '</p>' +
        '</div>';

      // Cover: prefer coverId, fall back to mediaId when it's an image
      var thumbId = item.coverId || (item.mediaType !== 'video' ? item.mediaId : null);
      if (thumbId) {
        (function (card, thumbId) {
          ImageDB.get(thumbId).then(function (rec) {
            if (!rec) return;
            var el = card.querySelector('.pg-card-thumb');
            if (el) el.src = rec.dataUrl;
          });
        })(card, thumbId);
      }

      grid.appendChild(card);
    });
  }

  // ── Modal ──────────────────────────────────────────────────────────────────

  var overlay   = document.getElementById('pg-modal-overlay');
  var mediaWrap = document.getElementById('pg-modal-media-wrap');
  var titleEl   = document.getElementById('pg-modal-title');
  var descEl    = document.getElementById('pg-modal-desc');
  var closeBtn  = document.getElementById('pg-modal-close');

  function openModal(item) {
    titleEl.textContent = item.title || '';
    descEl.textContent  = item.desc  || '';
    var liveLinkEl = document.getElementById('pg-modal-live-link');
    if (item.liveUrl) {
      liveLinkEl.href          = item.liveUrl;
      liveLinkEl.style.display = '';
    } else {
      liveLinkEl.style.display = 'none';
    }
    mediaWrap.innerHTML = '';

    if (item.mediaId) {
      ImageDB.get(item.mediaId).then(function (rec) {
        if (!rec) return;
        var el;
        if (item.mediaType === 'video') {
          el = document.createElement('video');
          el.controls    = true;
          el.autoplay    = true;
          el.muted       = true;
          el.loop        = true;
          el.playsInline = true;
          el.className   = 'pg-modal-video';
          mediaWrap.appendChild(el);
          fetch(rec.dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
            el.src = URL.createObjectURL(blob);
            el.play().catch(function () {});
          });
        } else {
          el = document.createElement('img');
          el.alt       = item.title || '';
          el.className = 'pg-modal-img';
          el.src       = rec.dataUrl;
          mediaWrap.appendChild(el);
        }
      });
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
    if (video) { video.pause(); video.src = ''; }
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
