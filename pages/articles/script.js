// Article index, backed by the Substack feed via /api/articles.
//
// This used to read a list out of localStorage, which meant the page only ever
// had content in the one browser that wrote it — every visitor saw a single
// hardcoded entry. Now the posts come from the feed, and each one opens in the
// site's own reader rather than sending the reader off to Substack.

(function () {
  var list = document.getElementById('articles-list');
  if (!list) return;

  var SUBSTACK = 'https://sulaimonodeniran.substack.com';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function message(html) {
    list.innerHTML = '<p class="articles-empty">' + html + '</p>';
  }

  function skeletons(n) {
    var html = '';
    for (var i = 0; i < n; i++) {
      html +=
        '<div class="article-item is-skeleton">' +
          '<div class="article-cover"><div class="sk sk-cover"></div></div>' +
          '<div class="article-info">' +
            '<div class="sk sk-title"></div>' +
            '<div class="sk sk-desc"></div>' +
          '</div>' +
        '</div>';
    }
    list.innerHTML = html;
  }

  function render(posts) {
    if (!posts.length) {
      message('Nothing published yet.');
      return;
    }

    var html = posts.map(function (p) {
      var cover = p.cover
        ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" decoding="async" />'
        : '';
      return '<a class="article-item" href="/pages/articles/read/?slug=' + encodeURIComponent(p.slug) + '">' +
          '<div class="article-cover">' + cover + '</div>' +
          '<div class="article-info">' +
            '<p class="article-title">' + esc(p.title) + '</p>' +
            '<p class="article-desc">' + esc(p.excerpt) + '</p>' +
            (p.dateLabel ? '<p class="article-date">' + esc(p.dateLabel) + '</p>' : '') +
          '</div>' +
        '</a>';
    }).join('');

    list.innerHTML = html;
  }

  skeletons(2);

  fetch('/api/articles')
    .then(function (r) {
      if (!r.ok) throw new Error('articles responded ' + r.status);
      return r.json();
    })
    .then(render)
    .catch(function () {
      // The feed is the only source, so say so plainly rather than showing an
      // empty page, and still give the reader somewhere to go.
      message('Couldn\'t load the writing just now — you can read it on ' +
        '<a href="' + SUBSTACK + '" target="_blank" rel="noopener noreferrer">Substack</a> instead.');
    });
})();
