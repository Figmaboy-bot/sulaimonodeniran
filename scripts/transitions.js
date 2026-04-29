(function () {
  document.addEventListener('click', function (e) {
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
})();
