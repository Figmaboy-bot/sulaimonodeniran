// Renders the GitHub contribution calendar on the about page.
// Data comes from /api/github-contributions (GitHub's own fragment, parsed
// server-side). If that call fails the whole block stays hidden rather than
// leaving an empty grid on the page.

(function () {

  var root = document.getElementById('github-graph');
  if (!root) return;

  var gridEl   = root.querySelector('.gh-grid');
  var monthsEl = root.querySelector('.gh-months');
  var countEl  = root.querySelector('.gh-count');

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Dates arrive as plain YYYY-MM-DD; parsing them as UTC keeps a day from
  // sliding into the wrong column for viewers behind GMT.
  function parseDate(iso) {
    var p = iso.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }

  function label(d, count) {
    var day = d.getUTCDate();
    var when = MONTHS[d.getUTCMonth()] + ' ' + day + ', ' + d.getUTCFullYear();
    if (!count) return 'No contributions on ' + when;
    return count + (count === 1 ? ' contribution on ' : ' contributions on ') + when;
  }

  // One shared tooltip lives on <body> so the horizontal scroller's overflow
  // can't clip it. It's positioned from the hovered cell's screen rect.
  var tip = null;

  function showTip(cell) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'gh-tip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.textContent = cell.dataset.label;
    tip.classList.add('is-visible');

    var r   = cell.getBoundingClientRect();
    var w   = tip.offsetWidth;
    var pad = 8;
    var x   = r.left + r.width / 2 - w / 2;
    x = Math.max(pad, Math.min(x, window.innerWidth - w - pad));
    var above = r.top - tip.offsetHeight - 8;
    var below = r.bottom + 8;
    var flip  = above < pad;
    tip.classList.toggle('is-below', flip);
    tip.style.left = x + 'px';
    tip.style.top  = (flip ? below : above) + 'px';
    tip.style.setProperty('--gh-tip-arrow', (r.left + r.width / 2 - x) + 'px');
  }

  function hideTip() {
    if (tip) tip.classList.remove('is-visible');
  }

  function cellFrom(target) {
    var el = target && target.closest ? target.closest('.gh-day') : null;
    return el && !el.classList.contains('gh-day--pad') && el.dataset.label ? el : null;
  }

  var current = null;

  function point(cell) {
    if (cell === current) return;
    current = cell;
    if (cell) showTip(cell); else hideTip();
  }

  function bindTooltip() {
    // Following the pointer's position (rather than only enter/leave events)
    // keeps the tooltip in step with whichever cell is actually under it.
    gridEl.addEventListener('mousemove', function (e) {
      point(cellFrom(e.target));
    });
    gridEl.addEventListener('mouseover', function (e) {
      point(cellFrom(e.target));
    });
    gridEl.addEventListener('mouseleave', function () { point(null); });

    gridEl.addEventListener('focusin', function (e) {
      var cell = cellFrom(e.target);
      if (cell) point(cell);
    });
    gridEl.addEventListener('focusout', function () { point(null); });

    // No hover on touch screens: a tap shows a day and a finger sliding
    // across the grid moves the tooltip with it.
    function fromTouch(e) {
      var t = e.touches[0];
      return t ? cellFrom(document.elementFromPoint(t.clientX, t.clientY)) : null;
    }
    gridEl.addEventListener('touchstart', function (e) { point(fromTouch(e)); }, { passive: true });
    gridEl.addEventListener('touchmove',  function (e) { point(fromTouch(e)); }, { passive: true });
    document.addEventListener('touchstart', function (e) {
      if (!cellFrom(e.target)) point(null);
    }, { passive: true });

    // The tooltip is fixed, so a page scroll would leave it floating in place.
    window.addEventListener('scroll', function () { point(null); }, { passive: true });
    // Scrolling the calendar sideways just moves the tooltip with its cell.
    var scroller = root.querySelector('.gh-scroll');
    if (scroller) scroller.addEventListener('scroll', function () {
      if (current) showTip(current);
    }, { passive: true });
  }

  function render(data) {
    var days = data.days || [];
    if (!days.length) return;

    var first  = parseDate(days[0].date);
    var offset = first.getUTCDay();               // pad to the Sunday row
    var weeks  = Math.ceil((offset + days.length) / 7);

    gridEl.style.setProperty('--gh-weeks', weeks);
    monthsEl.style.setProperty('--gh-weeks', weeks);

    var frag = document.createDocumentFragment();
    for (var i = 0; i < offset; i++) {
      var pad = document.createElement('span');
      pad.className = 'gh-day gh-day--pad';
      frag.appendChild(pad);
    }
    days.forEach(function (d) {
      var cell = document.createElement('span');
      cell.className = 'gh-day';
      cell.dataset.level = d.level;
      cell.dataset.label = label(parseDate(d.date), d.count);
      cell.tabIndex = 0;
      frag.appendChild(cell);
    });
    gridEl.appendChild(frag);
    bindTooltip();

    // One label per month, placed on the column where that month first appears.
    var labels = document.createDocumentFragment();
    var seen   = -1;
    for (var w = 0; w < weeks; w++) {
      var index = w * 7 - offset;
      var day   = days[Math.max(index, 0)];
      if (!day) break;
      var month = parseDate(day.date).getUTCMonth();
      if (month === seen) continue;
      seen = month;
      // A month starting in the last few days of the graph has no room for
      // its name, and the first column is usually a stub of the month before.
      if (w === 0 || w > weeks - 3) continue;
      var el = document.createElement('span');
      el.className = 'gh-month';
      el.style.gridColumn = (w + 1) + ' / span 4';
      el.textContent = MONTHS[month];
      labels.appendChild(el);
    }
    monthsEl.appendChild(labels);

    if (countEl) {
      countEl.textContent = data.total.toLocaleString() +
        (data.total === 1 ? ' contribution' : ' contributions') + ' in the last year';
    }

    root.hidden = false;
    // Most recent week first is what people look for; the scroller on narrow
    // screens should already be sitting at that end.
    var scroller = root.querySelector('.gh-scroll');
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }

  // no-cache forces a revalidation on every load, so a day spent on the tab
  // never leaves a stale count on screen.
  fetch('/api/github-contributions', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) { if (data && !data.error) render(data); })
    .catch(function () { /* block stays hidden */ });

})();
