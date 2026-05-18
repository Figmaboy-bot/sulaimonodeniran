(function () {
  var SUPABASE_URL = 'https://axpgphfcjzhyoimxxwrz.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cGdwaGZjanpoeW9pbXh4d3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1ODU0MjIsImV4cCI6MjA5MzE2MTQyMn0.sZSJA58Uqr67vNBTNin2SGi5jQlBhouVC1baofaVN-o';

  function record(country) {
    fetch(SUPABASE_URL + '/rest/v1/page_views', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        page: window.location.pathname,
        referrer: document.referrer || null,
        country: country || null
      })
    }).catch(function () {});
  }

  fetch('/api/geo')
    .then(function (r) { return r.json(); })
    .then(function (geo) { record(geo.country); })
    .catch(function () { record(null); });
})();
