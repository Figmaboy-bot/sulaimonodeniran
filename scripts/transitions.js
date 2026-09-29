(function () {
  document.addEventListener('click', function (e) {
    // new-tab / modifier clicks keep the browser's default
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest('a[href]');
    if (!link) return;

    var href = link.getAttribute('href');
    if (
      !href ||
      href.charAt(0) === '#' ||
      href.indexOf('mailto:') === 0 ||
      href.indexOf('tel:') === 0 ||
      link.target === '_blank' ||
      (link.hostname && link.hostname !== location.hostname)
    ) return;

    e.preventDefault();
    var main = document.querySelector('main');
    if (main) {
      main.style.transition = 'transform 0.28s cubic-bezier(0.76, 0, 0.24, 1), opacity 0.22s ease';
      main.style.transform  = 'translateY(-28px)';
      main.style.opacity    = '0';
    }
    document.body.style.transition = 'opacity 0.28s ease';
    document.body.style.opacity    = '0';
    setTimeout(function () {
      location.href = href;
    }, 290);
  });

  // Pages leave by fading out (above, and the project page's Back link).
  // The browser's Back/Forward restores a page from its cache exactly as it
  // was left — faded out — so clear those fades when that happens.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    [document.body, document.querySelector('main'), document.getElementById('project-gallery')]
      .forEach(function (el) {
        if (!el) return;
        el.style.transition = 'none';
        el.style.opacity    = '';
        el.style.transform  = '';
      });
  });
})();
