// Auto-scrolling image strip used on the home and about pages.
// The track element declares which set to load: <div class="carousel-track" data-carousel="home">
(function () {
  var track = document.querySelector('.carousel-track[data-carousel]');
  if (!track) return;
  var page = track.getAttribute('data-carousel');

  function applyDuration(rows) {
    if (rows[0] && rows[0].duration) track.style.animationDuration = rows[0].duration + 's';
  }

  sbSelect('carousel_settings', 'select=duration&page=eq.' + page + '&limit=1', applyDuration)
    .then(applyDuration).catch(function () {});

  function renderImages(rows) {
    if (!rows.length) return;
    var frag = document.createDocumentFragment();

    function addCard(item, index, hidden) {
      var div = document.createElement('div');
      div.className = 'work-card';
      if (hidden) div.setAttribute('aria-hidden', 'true');
      var img = document.createElement('img');
      img.src = cdnUrl(item.url);
      img.alt = '';
      img.decoding = 'async';
      // Only the cards on screen at rest are worth blocking on. The rest of
      // the strip — and the duplicate half — scrolls into view later.
      img.loading = (!hidden && index < 3) ? 'eager' : 'lazy';
      if (item.crop && item.crop.x !== undefined) {
        img.style.objectPosition = item.crop.x + '% ' + item.crop.y + '%';
      }
      div.appendChild(img);
      frag.appendChild(div);
    }

    rows.forEach(function (item, i) { addCard(item, i, false); });
    rows.forEach(function (item, i) { addCard(item, i, true); });
    track.innerHTML = '';
    track.appendChild(frag);
  }

  sbSelect('carousel_images', 'select=url,crop&page=eq.' + page + '&order=sort_order.asc', renderImages)
    .then(renderImages).catch(function () {});
})();
