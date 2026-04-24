function startWATClock() {
  function tick() {
    const el = document.getElementById('wat-time');
    if (!el) return;
    const time = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos'
    });
    const [hh, mm] = time.split(':');
    el.innerHTML = `${hh} <span class="blink-colon">:</span> ${mm} (WAT, GMT+1)`;
  }
  tick();
  setInterval(tick, 1000);
}
