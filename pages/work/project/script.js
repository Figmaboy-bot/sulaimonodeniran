(function () {

  // ── Resolve the project ─────────────────────
  // Prefer the copy /api/project.js embedded server-side: it means a link
  // shared cold — no prior visit to /pages/work/ to warm the cache — renders
  // straight away instead of bouncing back to the index.
  var id = new URLSearchParams(location.search).get('id');

  function fromServer() {
    return (window.__PROJECT__ && window.__PROJECT__.id === id) ? window.__PROJECT__ : null;
  }

  function fromCache() {
    var source = typeof PROJECTS !== 'undefined' ? PROJECTS : null;
    try {
      var stored = localStorage.getItem('portfolio_projects');
      if (stored) source = JSON.parse(stored);
    } catch (e) {}
    return (source && source[id]) || null;
  }

  // The copy that ships with the build (data/snapshot.json via scripts/sb.js),
  // so a cold link still renders when the server render was skipped.
  function fromSnapshot() {
    var snap = typeof PORTFOLIO_SNAPSHOT !== 'undefined' ? PORTFOLIO_SNAPSHOT : null;
    var rows = (snap && snap.projects) || [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === String(id)) return rows[i];
    }
    return null;
  }

  // Last resort: nothing local knows this id — it may have been published
  // after this build went out.
  function fromSupabase() {
    if (typeof SUPABASE_URL === 'undefined' || !id) return Promise.resolve(null);
    return fetch(SUPABASE_URL + '/rest/v1/projects?select=*&limit=1&id=eq.' + encodeURIComponent(id), {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return (rows && rows[0]) || null; })
      .catch(function () { return null; });
  }

  var project = fromServer() || fromCache() || fromSnapshot();

  if (project) {
    render(project);
  } else {
    fromSupabase().then(function (p) {
      if (p) render(p);
      else location.replace('/pages/work/');
    });
  }

  function render(project) {

    // ── Populate header + info ──────────────────
    document.title = project.title + ' — Ola';
    document.getElementById('project-title').textContent    = project.title;
    var taglineEl = document.getElementById('project-tagline');
    taglineEl.textContent = project.tagline || '';
    if (!project.tagline) taglineEl.style.display = 'none';
    document.getElementById('project-about').textContent    = project.about || '';
    document.getElementById('project-industry').textContent = project.industry || '';
    document.getElementById('project-role').textContent     = project.role || '';
    document.getElementById('project-year').textContent     = project.year || '';

    var liveBtn = document.getElementById('btn-live');
    var liveUrl = project.live_url || project.liveUrl;
    if (liveUrl) {
      liveBtn.href          = liveUrl;
      liveBtn.style.display = '';
    }

    // ── Build gallery ───────────────────────────
    var gallery = document.getElementById('project-gallery');

    var SVG_PAUSE   = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    var SVG_PLAY    = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>';
    var SVG_VOL_OFF = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
    var SVG_VOL_ON  = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';

    function makeMedia(mediaType, alt, eager, w, h) {
      var wrap = document.createElement('div');
      wrap.className = 'gallery-img';
      var el;
      if (mediaType === 'video') {
        el = document.createElement('video');
        el.muted    = true;
        el.loop     = true;
        el.setAttribute('playsinline', '');
        // 'none' + no src until the observer below sees this element near the
        // viewport — previously 'auto' + autoplay meant every video in the
        // gallery downloaded in full on page load, regardless of scroll
        // position. That was the single biggest source of repeat egress.
        el.setAttribute('preload', 'none');
      } else {
        el = document.createElement('img');
        el.alt      = alt;
        el.loading  = eager ? 'eager' : 'lazy';
        el.decoding = 'async';
        // the cover is the largest contentful paint — fetch it ahead of the rest
        if (eager) el.setAttribute('fetchpriority', 'high');
      }
      // intrinsic size reserves the block's height before the bytes land, so the
      // gallery no longer reflows from a stack of blank white panels
      if (w && h) {
        el.setAttribute('width', w);
        el.setAttribute('height', h);
      }
      wrap.appendChild(el);

      if (mediaType === 'video') {
        var controls     = document.createElement('div');
        controls.className = 'video-controls';

        var playBtn      = document.createElement('button');
        playBtn.className = 'vc-btn vc-play-pause';
        playBtn.setAttribute('aria-label', 'Pause');
        playBtn.innerHTML = SVG_PAUSE;

        var progressWrap = document.createElement('div');
        progressWrap.className = 'vc-progress';
        var progressFill = document.createElement('div');
        progressFill.className = 'vc-progress-fill';
        progressWrap.appendChild(progressFill);

        var muteBtn      = document.createElement('button');
        muteBtn.className = 'vc-btn vc-mute';
        muteBtn.setAttribute('aria-label', 'Unmute');
        muteBtn.innerHTML = SVG_VOL_OFF;

        controls.appendChild(playBtn);
        controls.appendChild(progressWrap);
        controls.appendChild(muteBtn);
        wrap.appendChild(controls);

        playBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (el.paused) {
            el.play();
            playBtn.innerHTML = SVG_PAUSE;
            playBtn.setAttribute('aria-label', 'Pause');
          } else {
            el.pause();
            playBtn.innerHTML = SVG_PLAY;
            playBtn.setAttribute('aria-label', 'Play');
          }
        });

        muteBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          el.muted = !el.muted;
          muteBtn.innerHTML = el.muted ? SVG_VOL_OFF : SVG_VOL_ON;
          muteBtn.setAttribute('aria-label', el.muted ? 'Unmute' : 'Mute');
        });

        el.addEventListener('timeupdate', function () {
          if (el.duration) {
            progressFill.style.width = (el.currentTime / el.duration * 100) + '%';
          }
        });

        progressWrap.addEventListener('click', function (e) {
          e.stopPropagation();
          var rect = progressWrap.getBoundingClientRect();
          var pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          if (el.duration) el.currentTime = pct * el.duration;
        });
      }

      return wrap;
    }

    // Videos: only fetch + play once the element is near the viewport, instead
    // of every gallery video downloading in full on page load. rootMargin
    // starts the fetch a little before it's visible so playback is ready by
    // the time it scrolls into view, without loading everything up front.
    var lazyVideoObserver = 'IntersectionObserver' in window
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            var el = entry.target;
            if (entry.isIntersecting) {
              if (!el.src && el.dataset.src) {
                el.src = el.dataset.src;
                el.load();
              }
              el.play().catch(function () {});
            } else {
              el.pause();
            }
          });
        }, { rootMargin: '200px 0px' })
      : null;

    function resolveMedia(el, imageId, src, mediaType) {
      // cdnUrl() puts the Cloudflare cache (now R2-backed) in front of
      // Supabase Storage; without it every visit re-downloads the whole
      // gallery (Supabase sends no-cache).
      var url = typeof cdnUrl === 'function' ? cdnUrl(src) : src;

      if (mediaType === 'video') {
        if (!url) return;
        if (lazyVideoObserver) {
          el.dataset.src = url;
          lazyVideoObserver.observe(el);
        } else {
          // no IntersectionObserver support — fall back to eager, still better
          // than nothing
          el.src = url;
          el.play().catch(function () {});
        }
        return;
      }

      if (imageId) {
        ImageDB.get(imageId).then(function (rec) {
          if (rec) el.src = rec.dataUrl;
          else if (url) el.src = url;
        }).catch(function () { if (url) el.src = url; });
      } else if (url) {
        el.src = url;
      }
    }

    // ── Paragraph formatting ──────────────────
    // Text blocks carry a small markdown subset typed or pasted in admin:
    // **bold**, lines starting "1." (numbered list) or "-" / "•" (bullets),
    // and blank lines between paragraphs. Everything is escaped first, so the
    // only markup that can reach the page is the handful of tags added here.
    function escHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function inlineRich(s) {
      return escHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    var OL_ITEM = /^\s*(\d+)[.)]\s+(.*)$/;
    var UL_ITEM = /^\s*[-•*]\s+(.*)$/;

    function renderRich(text) {
      var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
      var html  = '';
      var i     = 0;

      function blank(k) { return k < lines.length && !lines[k].trim(); }
      function nextFilled(k) { while (blank(k)) k++; return k; }

      while (i < lines.length) {
        if (blank(i)) { i++; continue; }

        var ordered = OL_ITEM.test(lines[i]);
        if (ordered || UL_ITEM.test(lines[i])) {
          var marker = ordered ? OL_ITEM : UL_ITEM;
          var start  = ordered ? parseInt(lines[i].match(OL_ITEM)[1], 10) : 1;
          var items  = [];
          // an item runs until a blank line or the next marker; a blank line
          // only ends the list when the next text isn't another item
          while (i < lines.length) {
            if (blank(i)) {
              var k = nextFilled(i);
              if (k < lines.length && marker.test(lines[k])) { i = k; continue; }
              break;
            }
            var m = lines[i].match(marker);
            if (m) items.push([ordered ? m[2] : m[1]]);
            else items[items.length - 1].push(lines[i].trim());
            i++;
          }
          var tag = ordered ? 'ol' : 'ul';
          html += '<' + tag + (ordered && start !== 1 ? ' start="' + start + '"' : '') + '>' +
            items.map(function (it) {
              return '<li>' + it.map(inlineRich).join('<br>') + '</li>';
            }).join('') +
            '</' + tag + '>';
          continue;
        }

        var para = [];
        while (i < lines.length && !blank(i) && !OL_ITEM.test(lines[i]) && !UL_ITEM.test(lines[i])) {
          para.push(inlineRich(lines[i].trim()));
          i++;
        }
        html += '<p>' + para.join('<br>') + '</p>';
      }
      return html;
    }

    // Text row: one or two heading + body columns set side by side.
    function makeText(section) {
      var row = document.createElement('section');
      row.className = 'project-text';
      (section.columns || []).forEach(function (col) {
        if (!col || (!col.heading && !col.body)) return;
        var c = document.createElement('div');
        c.className = 'text-col';
        if (col.heading) {
          var h = document.createElement('h2');
          h.className   = 'meta-label';
          h.textContent = col.heading;
          c.appendChild(h);
        }
        if (col.body) {
          var body = document.createElement('div');
          body.className = 'meta-body rich-text';
          body.innerHTML = renderRich(col.body);
          c.appendChild(body);
        }
        row.appendChild(c);
      });
      return row.children.length ? row : null;
    }

    // Consecutive images sit 12px apart; text rows and the info block get the
    // wider 40px rhythm of the content column, so images are grouped into stacks.
    var info  = document.getElementById('project-info');
    var stack = null;
    var infoPlaced = false;

    function placeInfo() {
      if (infoPlaced) return;
      gallery.appendChild(info);
      infoPlaced = true;
    }

    function mediaStack() {
      if (!stack) {
        stack = document.createElement('div');
        stack.className = 'media-stack';
        gallery.appendChild(stack);
      }
      return stack;
    }

    (project.gallery || []).forEach(function (section, i) {
      if (section.type === 'text') {
        var t = makeText(section);
        if (!t) return;
        placeInfo();
        stack = null;
        gallery.appendChild(t);
        return;
      }

      if (section.type === 'full') {
        var wrap = makeMedia(section.mediaType || 'image', section.alt || '', i === 0, section.w, section.h);
        resolveMedia(wrap.firstChild, section.imageId, section.src, section.mediaType);
        if (i === 0) {
          // the cover gets a fixed-height frame with the project info right below
          wrap.classList.add('gallery-img--full');
          gallery.insertBefore(wrap, info);
          placeInfo();
          return;
        }
        placeInfo();
        mediaStack().appendChild(wrap);
      } else if (section.type === 'pair') {
        placeInfo();
        var row = document.createElement('div');
        row.className = 'gallery-row';
        (section.images || []).forEach(function (item) {
          var w = makeMedia(item.mediaType || 'image', item.alt || '', false, item.w, item.h);
          if (item.w && item.h) w.style.setProperty('--ar', item.w / item.h);
          resolveMedia(w.firstChild, item.imageId, item.src, item.mediaType);
          row.appendChild(w);
        });
        mediaStack().appendChild(row);
      }
    });
    placeInfo();

    // ── Previous / next project ─────────────────
    var pager = document.getElementById('project-pager');
    var ARROW = '<img src="/image/Icons/Arrow.svg" alt="" class="pager-arrow" />';

    function pagerLink(p, dir) {
      var a = document.createElement('a');
      a.className = 'pager-link pager-link--' + dir;
      a.href = '/pages/work/project/?id=' + encodeURIComponent(p.id);
      var label = document.createElement('span');
      label.textContent = p.title || '';
      a.innerHTML = dir === 'prev' ? ARROW : '';
      a.appendChild(label);
      if (dir === 'next') a.insertAdjacentHTML('beforeend', ARROW);
      a.setAttribute('aria-label', (dir === 'prev' ? 'Previous project: ' : 'Next project: ') + (p.title || ''));
      return a;
    }

    function renderPager(rows) {
      var list = (rows || []).filter(function (p) {
        return p && p.id && (!p.coming_soon || String(p.id) === String(project.id || id));
      });
      var at = -1;
      for (var k = 0; k < list.length; k++) {
        if (String(list[k].id) === String(project.id || id)) { at = k; break; }
      }
      pager.innerHTML = '';
      if (at === -1 || list.length < 2) return;
      // wraps around, so the first and last projects still point somewhere
      var prev = list[(at - 1 + list.length) % list.length];
      var next = list[(at + 1) % list.length];
      pager.appendChild(pagerLink(prev, 'prev'));
      if (next !== prev) pager.appendChild(pagerLink(next, 'next'));
    }

    if (typeof sbSelect === 'function') {
      sbSelect('projects', 'select=id,title,coming_soon,sort_order&order=sort_order.asc', renderPager)
        .then(renderPager)
        .catch(function () {});
    }

    // ── Back button exit ────────────────────────
    var backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var href = this.getAttribute('href');
        var g = document.getElementById('project-gallery');
        if (g) {
          g.style.transition = 'transform 0.45s cubic-bezier(0.76,0,0.24,1), opacity 0.35s ease';
          g.style.transform  = 'translateY(80px)';
          g.style.opacity    = '0';
        }
        document.body.style.transition = 'opacity 0.4s ease';
        document.body.style.opacity    = '0';
        setTimeout(function () { location.href = href; }, 440);
      });
    }

  }

})();