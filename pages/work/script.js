(function () {
  document.querySelectorAll('.case-study[data-href]').forEach(function (article) {
    article.addEventListener('click', function () {
      var href = this.dataset.href;
      // Slide the work page up and out, then navigate to the project detail
      document.body.style.transition = 'transform 0.5s cubic-bezier(0.76, 0, 0.24, 1), opacity 0.4s ease';
      document.body.style.transform = 'translateY(-40px)';
      document.body.style.opacity = '0';
      setTimeout(function () {
        location.href = href;
      }, 480);
    });
  });
})();
