(function () {
  var track = document.getElementById('home-carousel-track');
  if (!track) return;
  var _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  _sb.from('carousel_settings').select('duration').eq('page', 'home').single()
    .then(function (res) {
      if (!res.error && res.data && res.data.duration) {
        track.style.animationDuration = res.data.duration + 's';
      }
    }).catch(function () {});

  _sb.from('carousel_images').select('url,crop').eq('page', 'home').order('sort_order', { ascending: true })
    .then(function (res) {
      if (res.error || !res.data || !res.data.length) return;
      track.innerHTML = '';
      function addCard(item, hidden) {
        var div = document.createElement('div');
        div.className = 'work-card';
        if (hidden) div.setAttribute('aria-hidden', 'true');
        var img = document.createElement('img');
        img.src = cdnUrl(item.url);
        img.loading = hidden ? 'lazy' : 'eager';
        if (item.crop && item.crop.x !== undefined) {
          img.style.objectPosition = item.crop.x + '% ' + item.crop.y + '%';
        }
        div.appendChild(img);
        track.appendChild(div);
      }
      res.data.forEach(function (item) { addCard(item, false); });
      res.data.forEach(function (item) { addCard(item, true); });
    }).catch(function () {});
})();
