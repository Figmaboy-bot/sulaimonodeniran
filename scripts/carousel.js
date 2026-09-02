// Auto-scrolling image strip used on the home and about pages.
// The track element declares which set to load: <div class="carousel-track" data-carousel="home">
(function () {
  var track = document.querySelector('.carousel-track[data-carousel]');
  if (!track) return;
  var page = track.getAttribute('data-carousel');

  sbSelect('carousel_settings', 'select=duration&page=eq.' + page + '&limit=1')
    .then(function (rows) {
      if (rows[0] && rows[0].duration) track.style.animationDuration = rows[0].duration + 's';
    }).catch(function () {});

  sbSelect('carousel_images', 'select=url,crop&page=eq.' + page + '&order=sort_order.asc')
    .then(function (rows) {
      if (!rows.length) return;
      var frag = document.createDocumentFragment();
      function addCard(item, hidden) {
        var div = document.createElement('div');
        div.className = 'work-card';
        if (hidden) div.setAttribute('aria-hidden', 'true');
        var img = document.createElement('img');
        img.src = cdnUrl(item.url);
        img.alt = '';
        img.decoding = 'async';
        // the duplicate half of the strip only scrolls into view later
        img.loading = hidden ? 'lazy' : 'eager';
        if (item.crop && item.crop.x !== undefined) {
          img.style.objectPosition = item.crop.x + '% ' + item.crop.y + '%';
        }
        div.appendChild(img);
        frag.appendChild(div);
      }
      rows.forEach(function (item) { addCard(item, false); });
      rows.forEach(function (item) { addCard(item, true); });
      track.innerHTML = '';
      track.appendChild(frag);
    }).catch(function () {});
})();
