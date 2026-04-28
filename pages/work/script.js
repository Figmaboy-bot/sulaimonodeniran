(function () {

  // Load from localStorage first, fallback to static file
  var source = PROJECTS;
  try {
    var stored = localStorage.getItem('portfolio_projects');
    if (stored) source = JSON.parse(stored);
  } catch (e) {}

  var list = document.getElementById('case-studies-list');
  if (!list) return;

  var ids = Object.keys(source || {});
  if (!ids.length) return;

  ids.forEach(function (id) {
    var p       = source[id];
    var meta    = p.meta || ((p.industry || '') + (p.year ? ' · ' + p.year : ''));
    var article = document.createElement('article');
    article.className        = 'case-study';
    article.dataset.href     = '/pages/work/project/?id=' + id;
    article.style.cursor     = 'pointer';

    article.innerHTML =
      '<div class="case-study-info">' +
        '<p class="case-study-meta">' + esc(meta) + '</p>' +
        '<div class="case-study-details">' +
          '<h2 class="case-study-title">' + esc(p.title || '') + '</h2>' +
          '<p class="case-study-desc">' + esc(p.about || p.tagline || '') + '</p>' +
          '<div class="case-study-role">' +
            '<p class="role-label">Role</p>' +
            '<p class="role-value">' + esc(p.role || '') + '</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="case-study-image">' +
        '<img src="" alt="' + esc(p.title || '') + '" loading="lazy" />' +
      '</div>';

    list.appendChild(article);

    // Load cover image: IndexedDB → coverSrc → cardImg → first gallery src
    var img = article.querySelector('.case-study-image img');

    function fallbackSrc() {
      if (p.coverSrc) return p.coverSrc;
      if (p.cardImg)  return p.cardImg;
      var first = (p.gallery || []).find(function (s) {
        return s.type === 'full' ? s.src : (s.images && s.images[0] && s.images[0].src);
      });
      if (!first) return '';
      return first.type === 'full' ? first.src : first.images[0].src;
    }

    if (p.coverImageId) {
      ImageDB.get(p.coverImageId).then(function (rec) {
        img.src = rec ? rec.dataUrl : fallbackSrc();
      }).catch(function () { img.src = fallbackSrc(); });
    } else {
      img.src = fallbackSrc();
    }

    // Slide-up transition on click
    article.addEventListener('click', function () {
      var href = this.dataset.href;
      document.body.style.transition = 'transform 0.5s cubic-bezier(0.76,0,0.24,1), opacity 0.4s ease';
      document.body.style.transform  = 'translateY(-40px)';
      document.body.style.opacity    = '0';
      setTimeout(function () { location.href = href; }, 480);
    });
  });

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
