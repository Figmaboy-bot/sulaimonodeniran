var ARTICLES_FALLBACK = [
  {
    title: 'End of 2025 Review',
    desc:  'So today is the end of the year, this year taught me a lot of lessons and amid the lessons I experienced massive career, financial, health and life growth.',
    date:  'Dec 31, 2025',
    url:   'https://sulaimonodeniran.substack.com/p/end-of-2025-review',
    img:   ''
  }
];

(function () {
  var list = document.getElementById('articles-list');
  if (!list) return;

  // Prefer admin-managed articles, fall back to hardcoded list
  var items = ARTICLES_FALLBACK;
  try {
    var stored = localStorage.getItem('portfolio_articles');
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed && parsed.length) items = parsed;
    }
  } catch (e) {}

  if (!items.length) {
    list.innerHTML = '<p style="font-family:var(--font-slab);color:var(--text-muted);padding:0 20px;">No articles yet.</p>';
    return;
  }

  items.forEach(function (article) {
    var a = document.createElement('a');
    a.className = 'article-item';
    a.href      = article.url || '#';
    a.target    = '_blank';
    a.rel       = 'noopener noreferrer';

    // Cover: stored image (IndexedDB via coverId) or direct img URL
    var imgEl = document.createElement('div');
    imgEl.className = 'article-cover';

    if (article.coverId) {
      ImageDB.get(article.coverId).then(function (rec) {
        if (!rec) return;
        var img = document.createElement('img');
        img.src = rec.dataUrl; img.alt = article.title || ''; img.loading = 'lazy';
        imgEl.appendChild(img);
      });
    } else if (article.img) {
      var img = document.createElement('img');
      img.src = cdnUrl(article.img); img.alt = article.title || ''; img.loading = 'lazy';
      imgEl.appendChild(img);
    }

    var infoEl = document.createElement('div');
    infoEl.className = 'article-info';
    infoEl.innerHTML =
      '<p class="article-date">'  + esc(article.date  || '') + '</p>' +
      '<p class="article-title">' + esc(article.title || '') + '</p>' +
      '<p class="article-desc">'  + esc(article.desc  || '') + '</p>';

    a.appendChild(imgEl);
    a.appendChild(infoEl);
    list.appendChild(a);
  });

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
