(async function () {

  var id = new URLSearchParams(location.search).get('id');

  var items = [];
  try {
    items = await sbSelect('playground_items', 'select=*&order=sort_order.asc');
  } catch (e) {}

  var at = -1;
  for (var k = 0; k < items.length; k++) {
    if (String(items[k].id) === String(id)) { at = k; break; }
  }

  if (at === -1) {
    var content = document.getElementById('pg-detail');
    content.innerHTML = '<p class="pg-detail-missing">This item isn’t in the playground any more.</p>';
    return;
  }

  var item = items[at];

  // ── Header ──────────────────────────────────
  document.getElementById('pg-title').textContent = item.title       || '';
  document.getElementById('pg-desc').textContent  = item.description || '';
  if (item.title) document.title = item.title + ' — Sulaimon Odeniran';

  // ── Media ───────────────────────────────────
  // A video plays on its own, muted and looping like the card's hover
  // preview, opening on the cover frame picked in admin.
  var media = document.getElementById('pg-media');
  if (item.media_url && item.media_type === 'video') {
    var v = document.createElement('video');
    v.muted       = true;
    v.loop        = true;
    v.autoplay    = true;
    v.playsInline = true;
    v.setAttribute('aria-label', item.title || '');
    if (item.cover_url) v.poster = cdnUrl(item.cover_url);
    var start = Number(item.cover_time) || 0;
    v.src = cdnUrl(item.media_url) + (start ? '#t=' + start : '');
    media.appendChild(v);
    v.play().catch(function () {});
  } else if (item.media_url || item.cover_url) {
    var img = document.createElement('img');
    img.alt = item.title || '';
    img.src = cdnUrl(item.media_url || item.cover_url);
    media.appendChild(img);
  } else {
    media.hidden = true;
  }

  // ── About + live link ───────────────────────
  if (item.about) {
    document.getElementById('pg-about').textContent = item.about;
    document.getElementById('pg-about-block').hidden = false;
  }

  if (item.live_url) {
    var live = document.getElementById('pg-live');
    live.href   = item.live_url;
    live.hidden = false;
  }

  // ── Previous / next item ────────────────────
  var pager = document.getElementById('pg-pager');
  var ARROW = '<img src="/image/Icons/Arrow.svg" alt="" class="pager-arrow" />';

  function pagerLink(p, dir) {
    var a = document.createElement('a');
    a.className = 'pager-link pager-link--' + dir;
    a.href = '/pages/playground/item/?id=' + encodeURIComponent(p.id);
    var label = document.createElement('span');
    label.textContent = p.title || '';
    a.innerHTML = dir === 'prev' ? ARROW : '';
    a.appendChild(label);
    if (dir === 'next') a.insertAdjacentHTML('beforeend', ARROW);
    a.setAttribute('aria-label', (dir === 'prev' ? 'Previous: ' : 'Next: ') + (p.title || ''));
    return a;
  }

  // wraps around, so the first and last items still point somewhere
  if (items.length > 1) {
    var prev = items[(at - 1 + items.length) % items.length];
    var next = items[(at + 1) % items.length];
    pager.appendChild(pagerLink(prev, 'prev'));
    if (next !== prev) pager.appendChild(pagerLink(next, 'next'));
  }

})();
