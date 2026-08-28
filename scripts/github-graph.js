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
      cell.title = label(parseDate(d.date), d.count);
      frag.appendChild(cell);
    });
    gridEl.appendChild(frag);

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

  fetch('/api/github-contributions')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) { if (data && !data.error) render(data); })
    .catch(function () { /* block stays hidden */ });

})();
