// Records one page view per load via /api/track, which adds the visitor's
// country from Vercel's geo header and writes the row to Supabase.
// sendBeacon survives the tab closing mid-request, so quick bounces still count.
(function () {
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
