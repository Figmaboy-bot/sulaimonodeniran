// ── Image + video zoom ──────────────────────
// Shared by the project and playground pages; their styles live with the
// project page (/pages/work/project/style.css, .img-zoom*).
(function () {

  // Clicking a gallery image lifts a copy out of the page and grows it from
  // where it sits to fit the viewport, over a dimmed backdrop. A video is
  // lifted out itself, with its controls, so it keeps playing where it was.
  // Click, Esc, scroll or resize shrinks it back into place.
  var zoom = null;

  function fitRect(nw, nh) {
    var pad  = window.innerWidth <= 600 ? 16 : 48;
    var maxW = window.innerWidth  - pad * 2;
    var maxH = window.innerHeight - pad * 2;
    var s    = Math.min(maxW / nw, maxH / nh);
    var w    = nw * s;
    var h    = nh * s;
    return { left: (window.innerWidth - w) / 2, top: (window.innerHeight - h) / 2, width: w, height: h };
  }

  function placeAt(el, r) {
    el.style.left   = r.left + 'px';
    el.style.top    = r.top + 'px';
    el.style.width  = r.width + 'px';
    el.style.height = r.height + 'px';
  }

  function openZoom(img) {
    if (zoom || !img.currentSrc && !img.src) return;
    var from = img.parentNode.getBoundingClientRect();
    var to   = fitRect(img.naturalWidth || img.width, img.naturalHeight || img.height);

    var overlay = document.createElement('div');
    overlay.className = 'img-zoom';
    var copy = document.createElement('img');
    copy.className = 'img-zoom-img';
    copy.src = img.currentSrc || img.src;
    copy.alt = img.alt;
    copy.style.objectPosition = getComputedStyle(img).objectPosition;
    // starts on the source's box, cropped the same way, then grows to fit
    placeAt(copy, from);
    overlay.appendChild(copy);
    document.body.appendChild(overlay);

    img.parentNode.classList.add('is-zoomed');
    zoom = { img: img, overlay: overlay, copy: copy };

    // grow the page copy straight away, then swap in the sharp one once it
    // has decoded, so the click never waits on the network
    if (img.dataset.full) {
      var sharp = new Image();
      sharp.src = img.dataset.full;
      (sharp.decode ? sharp.decode() : Promise.reject()).then(function () {
        if (zoom && zoom.copy === copy) copy.src = sharp.src;
      }).catch(function () {});
    }

    growZoom(to);
  }

  function openVideoZoom(video) {
    if (zoom) return;
    var wrap = video.parentNode;
    var from = wrap.getBoundingClientRect();
    // before the metadata is in, the frame's own shape stands in
    var to   = fitRect(video.videoWidth || from.width, video.videoHeight || from.height);
    var controls = wrap.querySelector('.video-controls');
    var playing  = !video.paused;

    var overlay = document.createElement('div');
    overlay.className = 'img-zoom';
    var stage = document.createElement('div');
    stage.className = 'img-zoom-img img-zoom-stage';
    stage.style.setProperty('--zoom-pos', getComputedStyle(video).objectPosition);
    placeAt(stage, from);
    overlay.appendChild(stage);
    document.body.appendChild(overlay);

    // the frame holds its height while the video is away
    wrap.style.height = from.height + 'px';
    wrap.classList.add('is-zoomed');
    stage.appendChild(video);
    if (controls) stage.appendChild(controls);
    if (playing) video.play().catch(function () {});
    zoom = { img: video, overlay: overlay, copy: stage, wrap: wrap, controls: controls };

    growZoom(to);
  }

  function growZoom(to) {
    // force the start position to paint before animating to the fit
    zoom.copy.getBoundingClientRect();
    zoom.overlay.classList.add('is-open');
    placeAt(zoom.copy, to);

    zoom.overlay.addEventListener('click', closeZoom);
    document.addEventListener('keydown', onZoomKey);
    window.addEventListener('scroll', closeZoom, { passive: true });
    window.addEventListener('resize', closeZoom);
  }

  function closeZoom() {
    if (!zoom || zoom.closing) return;
    var z = zoom;
    z.closing = true;
    document.removeEventListener('keydown', onZoomKey);
    window.removeEventListener('scroll', closeZoom);
    window.removeEventListener('resize', closeZoom);

    placeAt(z.copy, (z.wrap || z.img.parentNode).getBoundingClientRect());
    z.overlay.classList.remove('is-open');

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      if (z.wrap) {
        // the video and its controls go back where they came from
        var playing = !z.img.paused;
        z.wrap.insertBefore(z.img, z.wrap.firstChild);
        if (z.controls) z.wrap.appendChild(z.controls);
        z.wrap.style.height = '';
        if (playing) z.img.play().catch(function () {});
      }
      z.img.parentNode.classList.remove('is-zoomed');
      z.overlay.remove();
      zoom = null;
    }
    z.copy.addEventListener('transitionend', function (e) {
      if (e.propertyName === 'width') finish();
    });
    setTimeout(finish, 500);
  }

  function onZoomKey(e) {
    if (e.key === 'Escape') closeZoom();
  }

  // Opens whatever a .gallery-img frame holds: its video, or its image once
  // that has loaded.
  window.mediaZoom = function (wrap) {
    var video = wrap.querySelector('video');
    if (video) { openVideoZoom(video); return; }
    var img = wrap.querySelector('img');
    if (img && img.complete && img.naturalWidth) openZoom(img);
  };

})();
