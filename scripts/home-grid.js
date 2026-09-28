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

  function card(p, size, index) {
    var href = '/pages/work/project/?id=' + encodeURIComponent(p.id);
    return '<a class="case-card case-card--' + size + '" href="' + esc(href) + '">' +
        '<div class="case-card-img">' +
          // the first row sits just below the hero; build.js preloads it
          '<img src="' + esc(cdnUrl(coverSrc(p))) + '" alt="' + esc(p.title || '') + '" decoding="async"' +
            (index < 3 ? ' loading="eager"' : ' loading="lazy"') + ' />' +
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
