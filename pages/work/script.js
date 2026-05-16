(function () {

  var list = document.getElementById('case-studies-list');
  if (!list) return;

  var _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── Skeletons ────────────────────────────────
  function showSkeletons(n) {
    for (var i = 0; i < n; i++) {
      var el = document.createElement('div');
      el.className = 'case-study-skeleton';
      el.innerHTML =
        '<div class="sk-info">' +
          '<div class="sk sk-meta"></div>' +
          '<div class="sk sk-title"></div>' +
          '<div class="sk sk-desc"></div>' +
          '<div class="sk sk-desc2"></div>' +
          '<div class="sk sk-rlabel"></div>' +
          '<div class="sk sk-rval"></div>' +
        '</div>' +
        '<div class="sk sk-image"></div>';
      list.appendChild(el);
    }
  }

  function clearSkeletons() {
    list.querySelectorAll('.case-study-skeleton').forEach(function (el) { el.remove(); });
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

  function renderProjects(projects) {
    clearSkeletons();
    if (!projects.length) return;

    projects.forEach(function (p) {
      var meta       = p.meta || ((p.industry || '') + (p.year ? ' · ' + p.year : ''));
      var id         = p.id;
      var isComingSoon = !!p.coming_soon;
      var article    = document.createElement('article');
      article.className    = 'case-study' + (isComingSoon ? ' is-coming-soon' : '');
      article.dataset.href = '/pages/work/project/?id=' + id;

      article.innerHTML =
        '<div class="case-study-info">' +
          '<p class="case-study-meta">' + esc(meta) + '</p>' +
          '<div class="case-study-details">' +
            '<div class="case-study-heading">' +
              '<h2 class="case-study-title">' + esc(p.title || '') + '</h2>' +
              '<p class="case-study-desc">' + esc(p.tagline || p.about || '') + '</p>' +
            '</div>' +
            '<div class="case-study-role">' +
              '<p class="role-label">Role</p>' +
              '<p class="role-value">' + esc(p.role || '') + '</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="case-study-image">' +
          '<img src="' + esc(coverSrc(p)) + '" alt="' + esc(p.title || '') + '" loading="lazy" />' +
          (isComingSoon ? '<div class="coming-soon-badge">Coming Soon</div>' : '') +
        '</div>';

      list.appendChild(article);

      if (!isComingSoon) {
        var imgWrap = article.querySelector('.case-study-image');
        imgWrap.addEventListener('click', function () {
          var href = article.dataset.href;
          var main = document.querySelector('main');
          if (main) {
            main.style.transition = 'transform 0.45s cubic-bezier(0.76,0,0.24,1), opacity 0.35s ease';
            main.style.transform  = 'translateY(-40px)';
            main.style.opacity    = '0';
          }
          document.body.style.transition = 'opacity 0.35s ease';
          document.body.style.opacity    = '0';
          setTimeout(function () { location.href = href; }, 460);
        });
      }
    });

    // Custom cursor (desktop only)
    var cursor = document.createElement('div');
    cursor.className = 'work-cursor';
    cursor.textContent = 'view project';
    document.body.appendChild(cursor);

    var rafId = null, cx = 0, cy = 0, cOver = false, cSoon = false;
    document.addEventListener('mousemove', function (e) {
      cx    = e.clientX;
      cy    = e.clientY;
      var imgEl = e.target.closest('.case-study-image');
      cOver = !!imgEl;
      cSoon = cOver && !!e.target.closest('.is-coming-soon');
      if (!rafId) {
        rafId = requestAnimationFrame(function () {
          cursor.style.left = cx + 'px';
          cursor.style.top  = cy + 'px';
          cursor.classList.toggle('is-visible', cOver);
          cursor.classList.toggle('is-soon', cSoon);
          cursor.textContent = cSoon ? 'coming soon' : 'view project';
          rafId = null;
        });
      }
    });
  }

  function fromStatic() {
    var source = PROJECTS || {};
    return Object.keys(source).map(function (id) { return Object.assign({ id: id }, source[id]); });
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Fetch ────────────────────────────────────
  showSkeletons(3);

  _sb.from('projects').select('*').order('sort_order', { ascending: true })
    .then(function (res) {
      if (!res.error && res.data && res.data.length) {
        renderProjects(res.data);
        var cache = {};
        res.data.forEach(function (p) { cache[p.id] = p; });
        try { localStorage.setItem('portfolio_projects', JSON.stringify(cache)); } catch (e) {}
      } else {
        renderProjects(fromStatic());
      }
    })
    .catch(function () {
      renderProjects(fromStatic());
    });

})();
