// Renders one Substack post inside the site, from /api/articles?slug=…
//
// The API has already stripped Substack's markup down to a plain semantic
// subset (see api/articles.js), so this only has to place it and fill in the
// title, date and cover.

(function () {
  var body = document.getElementById('read-body');
  if (!body) return;

  var titleEl  = document.getElementById('read-title');
  var dateEl   = document.getElementById('read-date');
  var coverEl  = document.getElementById('read-cover');
  var footEl   = document.getElementById('read-foot');
  var canonEl  = document.getElementById('read-canonical');

  var slug = new URLSearchParams(location.search).get('slug');

  function fail(html) {
    titleEl.textContent = 'Not found';
    body.innerHTML = '<p class="read-error">' + html + '</p>';
  }

  if (!slug) {
    location.replace('/pages/articles/');
    return;
  }

  body.innerHTML =
    '<div class="sk sk-line"></div><div class="sk sk-line"></div>' +
    '<div class="sk sk-line sk-line-short"></div>';

  fetch('/api/articles?slug=' + encodeURIComponent(slug))
    .then(function (r) {
      if (r.status === 404) throw new Error('missing');
      if (!r.ok) throw new Error('articles responded ' + r.status);
      return r.json();
    })
    .then(function (post) {
      document.title = post.title + ' — Ola';

      titleEl.textContent = post.title;
      dateEl.textContent  = post.dateLabel || '';

      if (post.cover) {
        var img = document.createElement('img');
        img.src = post.cover;
        img.alt = '';
        img.decoding = 'async';
        coverEl.appendChild(img);
        coverEl.hidden = false;
      }

      // Already sanitised server-side down to a tag allowlist.
      body.innerHTML = post.content || '';

      if (post.url) {
        canonEl.href = post.url;
        footEl.hidden = false;
      }
    })
    .catch(function (e) {
      if (e && e.message === 'missing') {
        fail('That piece isn\'t here. <a href="/pages/articles/">Back to articles</a>.');
      } else {
        fail('Couldn\'t load this one just now. ' +
          '<a href="https://sulaimonodeniran.substack.com/p/' + encodeURIComponent(slug) +
          '" target="_blank" rel="noopener noreferrer">Read it on Substack</a> instead.');
      }
    });
})();
