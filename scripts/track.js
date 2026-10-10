// Records one page view per load via /api/track, which adds the visitor's
// country from Vercel's geo header and stores the row in Cloudflare D1.
// sendBeacon survives the tab closing mid-request, so quick bounces still count.
(function () {
  // Set by the admin once you've unlocked it in this browser, so checking
  // your own site doesn't inflate the numbers. Per browser: unlock the admin
  // once on each device you browse the site from.
  try {
    if (localStorage.getItem('analytics_ignore') === '1') return;
  } catch (e) {}

  var payload = JSON.stringify({
    page: location.pathname,
    referrer: document.referrer || null
  });
  var sent = false;
  if (navigator.sendBeacon) {
    try {
      sent = navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    } catch (e) {}
  }
  if (!sent) {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(function () {});
  }
})();
