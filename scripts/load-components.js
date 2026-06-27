(function () {
  function loadComponent(id, path, callback) {
    var el = document.getElementById(id);
    if (!el) return;
    fetch(path)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        el.innerHTML = html;
        if (callback) callback();
      });
  }
  loadComponent('nav-component', '/components/nav/nav.html', typeof initNav !== 'undefined' ? initNav : null);
  loadComponent('footer-component', '/components/footer/footer.html', typeof startWATClock !== 'undefined' ? startWATClock : null);
})();
