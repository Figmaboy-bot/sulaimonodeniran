// About page scripts

(function () {
  var toggle   = document.getElementById('bio-toggle');
  var collapse = document.getElementById('bio-collapse');
  if (!toggle || !collapse) return;

  toggle.addEventListener('click', function () {
    var open = collapse.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    collapse.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggle.childNodes[0].textContent = open ? 'View less ' : 'View more ';
  });
})();
