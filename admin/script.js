// ── Projects tab ─────────────────────────────────────────────────────────────
(function () {

  var _sb         = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var PROJ_BUCKET = 'projects';

  // ── Auth ─────────────────────────────────────
  var PWD_KEY  = 'admin_pwd_hash';
  var AUTH_KEY = 'admin_authed';

  async function sha256(str) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function showLock() {
    var hasPassword = !!localStorage.getItem(PWD_KEY);
    document.getElementById('lock-title').textContent = hasPassword ? 'Welcome back' : 'Set a password';
    document.getElementById('lock-sub').textContent   = hasPassword
      ? 'Enter your password to continue'
      : 'First time — choose a password for the admin.';
    document.getElementById('lock-btn').textContent   = hasPassword ? 'Continue' : 'Set password';
  }

  document.getElementById('lock-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var input  = document.getElementById('lock-input');
    var errEl  = document.getElementById('lock-error');
    var btn    = document.getElementById('lock-btn');
    var pwd    = input.value;
    if (!pwd) return;
    btn.disabled = true;
    errEl.textContent = '';
    var hash       = await sha256(pwd);
    var storedHash = localStorage.getItem(PWD_KEY);
    if (!storedHash) {
      localStorage.setItem(PWD_KEY, hash);
      sessionStorage.setItem(AUTH_KEY, '1');
      document.getElementById('lock-screen').classList.add('hidden');
    } else if (hash === storedHash) {
      sessionStorage.setItem(AUTH_KEY, '1');
      document.getElementById('lock-screen').classList.add('hidden');
    } else {
      errEl.textContent = 'Incorrect password';
      input.classList.add('shake');
      input.addEventListener('animationend', function () { input.classList.remove('shake'); }, { once: true });
      input.value = '';
      input.focus();
    }
    btn.disabled = false;
  });

  document.getElementById('lock-toggle').addEventListener('click', function () {
    var input  = document.getElementById('lock-input');
    var eyeOn  = document.getElementById('icon-eye');
    var eyeOff = document.getElementById('icon-eye-off');
    var showing = input.type === 'text';
    input.type           = showing ? 'password' : 'text';
    eyeOn.style.display  = showing ? '' : 'none';
    eyeOff.style.display = showing ? 'none' : '';
    input.focus();
  });

  if (sessionStorage.getItem(AUTH_KEY)) {
    document.getElementById('lock-screen').classList.add('hidden');
  } else {
    showLock();
  }

  // ── State ─────────────────────────────────────
  var state = {
    projects:       {},
    order:          [],
    activeId:       null,
    gallery:        [],
    activeCoverUrl: null
  };

  var dragSrcIdx     = null;
  var sidebarDragSrc = null;

  // ── Storage helpers ───────────────────────────
  function uploadFile(file, folder, progressId) {
    return new Promise(function (resolve, reject) {
      var ext  = file.name.split('.').pop().toLowerCase();
      var path = folder + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
      var endpoint = SUPABASE_URL + '/storage/v1/object/' + PROJ_BUCKET + '/' + path;

      var bar  = progressId ? document.getElementById(progressId) : null;
      var fill = bar ? bar.querySelector('.upload-progress-fill') : null;
      var pct  = bar ? bar.querySelector('[id$="-pct"]') : null;
      var name = bar ? bar.querySelector('[id$="-name"]') : null;
      if (bar)  { bar.classList.add('active'); }
      if (fill) { fill.style.width = '0%'; }
      if (pct)  { pct.textContent = '0%'; }
      if (name) { name.textContent = file.name; }

      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.addEventListener('progress', function (e) {
        if (!e.lengthComputable) return;
        var p = Math.round((e.loaded / e.total) * 100);
        if (fill) fill.style.width = p + '%';
        if (pct)  pct.textContent  = p + '%';
      });

      xhr.addEventListener('load', function () {
        if (bar) bar.classList.remove('active');
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(SUPABASE_URL + '/storage/v1/object/public/' + PROJ_BUCKET + '/' + path);
        } else {
          var msg = 'Upload failed (' + xhr.status + ')';
          try { var body = JSON.parse(xhr.responseText); msg = body.error || body.message || msg; } catch (_) {}
          if (xhr.status === 413 || (msg && msg.toLowerCase().includes('size'))) {
            msg = 'File too large for the bucket — increase the max file size in your Supabase dashboard (Storage → Buckets → Edit)';
          }
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', function () {
        if (bar) bar.classList.remove('active');
        reject(new Error('Network error during upload'));
      });

      xhr.send(file);
    });
  }

  async function deleteStorageFile(url) {
    if (!url) return;
    try {
      var marker = '/object/public/' + PROJ_BUCKET + '/';
      var i = url.indexOf(marker);
      if (i !== -1) await _sb.storage.from(PROJ_BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]);
    } catch (e) {}
  }

  // ── Helpers ───────────────────────────────────
  function slugify(s) { return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  // ── Gallery format helpers ────────────────────
  function galleryToFlat(dbGallery) {
    var flat = [];
    (dbGallery || []).forEach(function (section) {
      if (section.type === 'full') {
        flat.push({ src: section.src || null, alt: section.alt || '', layout: 'full', mediaType: section.mediaType || 'image' });
      } else if (section.type === 'pair') {
        (section.images || []).forEach(function (img) {
          flat.push({ src: img.src || null, alt: img.alt || '', layout: 'half', mediaType: img.mediaType || 'image' });
        });
      }
    });
    return flat;
  }

  function galleryToProjectFormat() {
    var result = [];
    var i = 0;
    while (i < state.gallery.length) {
      var item = state.gallery[i];
      if (item.layout === 'half' && state.gallery[i + 1] && state.gallery[i + 1].layout === 'half') {
        result.push({ type: 'pair', images: [
          { src: item.src, alt: item.alt, mediaType: item.mediaType || 'image' },
          { src: state.gallery[i + 1].src, alt: state.gallery[i + 1].alt, mediaType: state.gallery[i + 1].mediaType || 'image' }
        ]});
        i += 2;
      } else {
        result.push({ type: 'full', src: item.src, alt: item.alt, mediaType: item.mediaType || 'image' });
        i++;
      }
    }
    return result;
  }

  // ── Sidebar list ──────────────────────────────
  function renderList() {
    var list = document.getElementById('project-list');
    list.innerHTML = '';

    state.order.forEach(function (id, idx) {
      var p  = state.projects[id];
      if (!p) return;
      var li = document.createElement('li');
      li.className   = 'project-list-item' + (id === state.activeId ? ' active' : '');
      li.dataset.id  = id;
      li.dataset.idx = idx;
      li.draggable   = true;

      li.innerHTML =
        '<span class="pli-drag" title="Drag to reorder">' +
          '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">' +
            '<circle cx="3.5" cy="2.5" r="1.1"/><circle cx="8.5" cy="2.5" r="1.1"/>' +
            '<circle cx="3.5" cy="6" r="1.1"/><circle cx="8.5" cy="6" r="1.1"/>' +
            '<circle cx="3.5" cy="9.5" r="1.1"/><circle cx="8.5" cy="9.5" r="1.1"/>' +
          '</svg>' +
        '</span>' +
        '<div class="pli-text">' +
          '<p class="pli-title">' + esc(p.title || 'Untitled') + '</p>' +
          '<p class="pli-meta">' + esc(p.industry || '') + (p.year ? ' · ' + esc(p.year) : '') + '</p>' +
        '</div>';

      li.addEventListener('click', function (e) {
        if (e.target.closest('.pli-drag')) return;
        selectProject(id);
      });

      li.addEventListener('dragstart', function (e) {
        sidebarDragSrc = idx;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(function () { li.classList.add('is-dragging'); }, 0);
      });
      li.addEventListener('dragend', function () {
        sidebarDragSrc = null;
        li.classList.remove('is-dragging');
        document.querySelectorAll('.project-list-item').forEach(function (el) { el.classList.remove('drag-over'); });
      });
      li.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      li.addEventListener('dragenter', function (e) {
        e.preventDefault();
        if (sidebarDragSrc !== null && sidebarDragSrc !== idx) li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
      li.addEventListener('drop', async function (e) {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (sidebarDragSrc === null || sidebarDragSrc === idx) return;
        var moved = state.order.splice(sidebarDragSrc, 1)[0];
        state.order.splice(idx, 0, moved);
        renderList();
        var updates = state.order
          .filter(function (oid) { return !!state.projects[oid] && !oid.startsWith('new-project-'); })
          .map(function (oid, i) { return { id: oid, sort_order: i }; });
        if (updates.length) await _sb.from('projects').upsert(updates);
        toast('Order saved');
      });

      list.appendChild(li);
    });
  }

  // ── Select project ────────────────────────────
  function selectProject(id) {
    state.activeId = id;
    document.querySelectorAll('.project-list-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.id === id);
    });
    populateEditor(id);
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('editor').style.display      = 'block';
  }

  // ── Populate editor ───────────────────────────
  function populateEditor(id) {
    var p = state.projects[id];
    document.getElementById('editor-heading').textContent = p.title || 'Untitled';
    document.getElementById('editor-url').textContent     = '/pages/work/project/?id=' + id;
    document.getElementById('btn-preview').href           = '/pages/work/project/?id=' + id;
    document.getElementById('f-slug').value     = id;
    document.getElementById('f-title').value    = p.title    || '';
    document.getElementById('f-tagline').value  = p.tagline  || '';
    document.getElementById('f-about').value    = p.about    || '';
    document.getElementById('f-industry').value = p.industry || '';
    document.getElementById('f-role').value     = p.role     || '';
    document.getElementById('f-year').value     = p.year     || '';
    document.getElementById('f-meta').value     = p.meta     || '';
    document.getElementById('f-live-url').value = p.live_url || '';
    document.getElementById('slug-preview').textContent = id;

    state.gallery        = galleryToFlat(p.gallery);
    state.activeCoverUrl = p.cover_url || null;

    renderGalleryGrid();
  }

  // ── Gallery grid ──────────────────────────────
  function renderGalleryGrid() {
    var grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';

    state.gallery.forEach(function (item, idx) {
      var isVideo  = item.mediaType === 'video';
      var isCover  = !!(state.activeCoverUrl && item.src && item.src === state.activeCoverUrl);
      var card     = document.createElement('div');
      card.className   = 'gcard' + (isCover ? ' is-cover' : '');
      card.dataset.idx = idx;

      var mediaHtml      = isVideo
        ? '<video class="gcard-img" muted preload="metadata" loop playsinline></video>'
        : '<img class="gcard-img" src="" alt="" />';
      var coverBtnHtml   = isVideo ? '' : '<button class="gcard-cover-btn" title="Set as cover">★</button>';
      var videoBadgeHtml = isVideo ? '<span class="gcard-video-badge">Video</span>' : '';

      card.draggable = true;

      card.innerHTML =
        '<div class="gcard-drag-handle" title="Drag to reorder">' +
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="4" cy="3" r="1.3"/><circle cx="10" cy="3" r="1.3"/><circle cx="4" cy="7" r="1.3"/><circle cx="10" cy="7" r="1.3"/><circle cx="4" cy="11" r="1.3"/><circle cx="10" cy="11" r="1.3"/></svg>' +
        '</div>' +
        '<div class="gcard-img-wrap">' +
          mediaHtml +
          '<div class="gcard-overlay">' +
            coverBtnHtml +
            '<button class="gcard-remove-btn" title="Remove">✕</button>' +
          '</div>' +
          '<span class="gcard-cover-badge">Cover</span>' +
          videoBadgeHtml +
        '</div>' +
        '<div class="gcard-meta">' +
          '<input class="field-input gcard-alt" type="text" placeholder="' + (isVideo ? 'Video label' : 'Alt text') + '" value="' + esc(item.alt) + '" />' +
          '<div class="gcard-layout">' +
            '<button class="gcard-layout-btn' + (item.layout !== 'half' ? ' active' : '') + '" data-layout="full">Full</button>' +
            '<button class="gcard-layout-btn' + (item.layout === 'half' ? ' active' : '') + '" data-layout="half">Half</button>' +
          '</div>' +
        '</div>';

      card.addEventListener('dragstart', function (e) {
        dragSrcIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(function () { card.classList.add('is-dragging'); }, 0);
      });
      card.addEventListener('dragend', function () {
        dragSrcIdx = null;
        card.classList.remove('is-dragging');
        document.querySelectorAll('.gcard').forEach(function (c) { c.classList.remove('drag-over'); });
      });
      card.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      card.addEventListener('dragenter', function () {
        if (dragSrcIdx !== null && dragSrcIdx !== idx) card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', function () { card.classList.remove('drag-over'); });
      card.addEventListener('drop', function (e) {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (dragSrcIdx === null || dragSrcIdx === idx) return;
        var moved = state.gallery.splice(dragSrcIdx, 1)[0];
        state.gallery.splice(idx, 0, moved);
        renderGalleryGrid();
      });

      var mediaEl = card.querySelector('.gcard-img');
      if (item.src) mediaEl.src = item.src;

      var coverBtn = card.querySelector('.gcard-cover-btn');
      if (coverBtn) {
        coverBtn.addEventListener('click', function () {
          if (!item.src) { toast('Upload this image first'); return; }
          state.activeCoverUrl = item.src;
          document.querySelectorAll('.gcard').forEach(function (c) {
            var cIdx  = parseInt(c.dataset.idx);
            var cItem = state.gallery[cIdx];
            c.classList.toggle('is-cover', !!(state.activeCoverUrl && cItem && cItem.src === state.activeCoverUrl));
          });
          toast('Cover image set');
        });
      }

      card.querySelector('.gcard-remove-btn').addEventListener('click', function () {
        if (item.src === state.activeCoverUrl) state.activeCoverUrl = null;
        state.gallery.splice(idx, 1);
        renderGalleryGrid();
      });

      card.querySelector('.gcard-alt').addEventListener('input', function () {
        state.gallery[idx].alt = this.value;
      });

      card.querySelectorAll('.gcard-layout-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.gallery[idx].layout = this.dataset.layout;
          card.querySelectorAll('.gcard-layout-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.layout === this.dataset.layout);
          }.bind(this));
        });
      });

      grid.appendChild(card);
    });
  }

  // ── File upload ───────────────────────────────
  var MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

  async function handleFiles(files) {
    if (!files || !files.length) return;
    for (var fi = 0; fi < files.length; fi++) {
      var file    = files[fi];
      var isVideo = file.type.startsWith('video/');
      var isImage = file.type.startsWith('image/');
      if (!isImage && !isVideo) continue;
      if (file.size > MAX_FILE_BYTES) { toast('File too large — max 100 MB'); continue; }
      toast('Uploading…');
      try {
        var url = await uploadFile(file, isVideo ? 'videos' : 'images', 'gallery-upload-progress');
        state.gallery.push({ src: url, alt: file.name.replace(/\.[^.]+$/, ''), layout: 'full', mediaType: isVideo ? 'video' : 'image' });
        if (!state.activeCoverUrl && isImage) state.activeCoverUrl = url;
        renderGalleryGrid();
        toast('Uploaded ✓');
      } catch (e) {
        toast('Upload failed: ' + e.message);
      }
    }
  }

  // ── Read form ─────────────────────────────────
  function readForm() {
    return {
      title:     document.getElementById('f-title').value.trim(),
      tagline:   document.getElementById('f-tagline').value.trim(),
      about:     document.getElementById('f-about').value.trim(),
      industry:  document.getElementById('f-industry').value.trim(),
      role:      document.getElementById('f-role').value.trim(),
      year:      document.getElementById('f-year').value.trim(),
      meta:      document.getElementById('f-meta').value.trim(),
      live_url:  document.getElementById('f-live-url').value.trim() || null,
      cover_url: state.activeCoverUrl || null,
      gallery:   galleryToProjectFormat()
    };
  }

  // ── Save project ──────────────────────────────
  async function saveProject() {
    var newSlug = slugify(document.getElementById('f-slug').value.trim());
    if (!newSlug) { toast('Slug is required'); return; }
    var data = readForm();
    if (!data.title) { toast('Title is required'); return; }
    var oldId = state.activeId;

    if (newSlug !== oldId) {
      var orderIdx = state.order.indexOf(oldId);
      if (orderIdx !== -1) state.order[orderIdx] = newSlug;
      else state.order.push(newSlug);
      delete state.projects[oldId];
      if (oldId && !oldId.startsWith('new-project-')) {
        await _sb.from('projects').delete().eq('id', oldId);
      }
    }

    var sortIdx = state.order.indexOf(newSlug);
    var row = Object.assign({ id: newSlug, sort_order: sortIdx !== -1 ? sortIdx : 0 }, data);

    var { error } = await _sb.from('projects').upsert(row);
    if (error) { toast('Save failed: ' + error.message); return; }

    state.projects[newSlug] = Object.assign({}, row);
    state.activeId = newSlug;
    renderList();
    selectProject(newSlug);
    toast('Project saved ✓');
  }

  // ── Delete project ────────────────────────────
  async function deleteProject() {
    if (!state.activeId) return;
    var p = state.projects[state.activeId];
    if (!confirm('Delete "' + ((p && p.title) || state.activeId) + '"?')) return;

    if (!state.activeId.startsWith('new-project-')) {
      var urls = [];
      (p.gallery || []).forEach(function (section) {
        if (section.type === 'full' && section.src) urls.push(section.src);
        else if (section.type === 'pair') {
          (section.images || []).forEach(function (img) { if (img.src) urls.push(img.src); });
        }
      });
      if (p.cover_url && urls.indexOf(p.cover_url) === -1) urls.push(p.cover_url);
      for (var u = 0; u < urls.length; u++) await deleteStorageFile(urls[u]);

      var { error } = await _sb.from('projects').delete().eq('id', state.activeId);
      if (error) { toast('Delete failed: ' + error.message); return; }
    }

    state.order    = state.order.filter(function (id) { return id !== state.activeId; });
    delete state.projects[state.activeId];
    state.activeId = null;
    renderList();
    document.getElementById('editor').style.display      = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    if (state.order.length) selectProject(state.order[0]);
    toast('Project deleted');
  }

  // ── New project ───────────────────────────────
  function newProject() {
    var tempId = 'new-project-' + Date.now();
    state.projects[tempId] = { title: '', tagline: '', about: '', industry: '', role: '', year: '', meta: '', live_url: null, cover_url: null, gallery: [] };
    state.order.push(tempId);
    renderList();
    selectProject(tempId);
    document.getElementById('f-slug').value = '';
    document.getElementById('f-slug').focus();
    toast('New project — fill in the details and save');
  }

  // ── Bind events ───────────────────────────────
  function bindGlobalEvents() {
    var zone  = document.getElementById('upload-zone');
    var input = document.getElementById('upload-input');

    input.addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
    zone.addEventListener('dragover',  function (e) { e.preventDefault(); this.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function ()  { this.classList.remove('drag-over'); });
    zone.addEventListener('drop',      function (e) {
      e.preventDefault(); this.classList.remove('drag-over');
      handleFiles(e.dataTransfer.files);
    });

    document.getElementById('f-slug').addEventListener('input', function () {
      document.getElementById('slug-preview').textContent = slugify(this.value) || '…';
    });
    document.getElementById('f-title').addEventListener('input', function () {
      document.getElementById('editor-heading').textContent = this.value || 'Untitled';
    });

    document.getElementById('btn-save').addEventListener('click', saveProject);
    document.getElementById('btn-delete').addEventListener('click', deleteProject);
    document.getElementById('btn-new').addEventListener('click', newProject);

    var exportBtn = document.getElementById('btn-export');
    if (exportBtn) exportBtn.style.display = 'none';

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        var projPanel = document.getElementById('projects-panel');
        if (projPanel && projPanel.style.display !== 'none') { e.preventDefault(); saveProject(); }
      }
    });
  }

  // ── Init ──────────────────────────────────────
  async function init() {
    var { data, error } = await _sb.from('projects').select('*').order('sort_order', { ascending: true });
    if (!error && data) {
      data.forEach(function (row) {
        state.projects[row.id] = row;
        state.order.push(row.id);
      });
    } else if (error) {
      toast('DB error: ' + error.message);
    }
    renderList();
    if (state.order.length) selectProject(state.order[0]);
    bindGlobalEvents();
  }

  init();

})();

// ── Playground tab ───────────────────────────────────────────────────────────
(function () {

  var _sb    = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var BUCKET = 'playground';

  var pgState = {
    items:    [],
    activeId: null
  };

  function pgUid() { return 'pg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
  function pgEsc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pgToast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  // ── Storage helpers ─────────────────────────────────────────────────────────

  var PG_MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

  function uploadFile(file, folder, progressId) {
    return new Promise(function (resolve, reject) {
      var ext  = file.name.split('.').pop().toLowerCase();
      var path = folder + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
      var endpoint = SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path;

      var bar  = progressId ? document.getElementById(progressId) : null;
      var fill = bar ? bar.querySelector('.upload-progress-fill') : null;
      var pct  = bar ? bar.querySelector('[id$="-pct"]') : null;
      var name = bar ? bar.querySelector('[id$="-name"]') : null;
      if (bar)  { bar.classList.add('active'); }
      if (fill) { fill.style.width = '0%'; }
      if (pct)  { pct.textContent = '0%'; }
      if (name) { name.textContent = file.name; }

      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.addEventListener('progress', function (e) {
        if (!e.lengthComputable) return;
        var p = Math.round((e.loaded / e.total) * 100);
        if (fill) fill.style.width = p + '%';
        if (pct)  pct.textContent  = p + '%';
      });

      xhr.addEventListener('load', function () {
        if (bar) bar.classList.remove('active');
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + path);
        } else {
          var msg = 'Upload failed (' + xhr.status + ')';
          try { var body = JSON.parse(xhr.responseText); msg = body.error || body.message || msg; } catch (_) {}
          if (xhr.status === 413 || (msg && msg.toLowerCase().includes('size'))) {
            msg = 'File too large for the bucket — increase the max file size in your Supabase dashboard (Storage → Buckets → Edit)';
          }
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', function () {
        if (bar) bar.classList.remove('active');
        reject(new Error('Network error during upload'));
      });

      xhr.send(file);
    });
  }

  async function deleteFile(url) {
    if (!url) return;
    try {
      var marker = '/object/public/' + BUCKET + '/';
      var i = url.indexOf(marker);
      if (i !== -1) await _sb.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]);
    } catch (e) {}
  }

  // ── Tab switching ───────────────────────────────────────────────────────────

  function initTabs() {
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = this.dataset.panel;
        document.querySelectorAll('.admin-tab').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        document.getElementById('projects-panel').style.display    = panel === 'projects'   ? 'flex' : 'none';
        document.getElementById('playground-panel').style.display  = panel === 'playground' ? 'flex' : 'none';
        document.getElementById('articles-panel').style.display    = panel === 'articles'   ? 'flex' : 'none';
        document.getElementById('carousel-panel').style.display    = panel === 'carousel'   ? 'flex' : 'none';
        document.getElementById('header-actions-projects').style.display   = panel === 'projects'   ? 'flex' : 'none';
        document.getElementById('header-actions-playground').style.display = panel === 'playground' ? 'flex' : 'none';
        document.getElementById('header-actions-articles').style.display   = panel === 'articles'   ? 'flex' : 'none';
        document.getElementById('header-actions-carousel').style.display   = panel === 'carousel'   ? 'flex' : 'none';
      });
    });
  }

  // ── List ────────────────────────────────────────────────────────────────────

  function renderPgList() {
    var list = document.getElementById('pg-item-list');
    list.innerHTML = '';
    pgState.items.forEach(function (item) {
      var li = document.createElement('li');
      li.className  = 'project-list-item' + (item.id === pgState.activeId ? ' active' : '');
      li.dataset.id = item.id;
      li.innerHTML =
        '<div class="pli-text">' +
          '<p class="pli-title">' + pgEsc(item.title      || 'Untitled') + '</p>' +
          '<p class="pli-meta">'  + pgEsc(item.media_type || '—')        + '</p>' +
        '</div>';
      li.addEventListener('click', function () { selectPgItem(item.id); });
      list.appendChild(li);
    });
  }

  // ── Select / populate ───────────────────────────────────────────────────────

  function selectPgItem(id) {
    pgState.activeId = id;
    document.querySelectorAll('#pg-item-list .project-list-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.id === id);
    });
    populatePgEditor(id);
    document.getElementById('pg-empty-state').style.display = 'none';
    document.getElementById('pg-editor').style.display      = 'block';
  }

  function populatePgEditor(id) {
    var item = pgState.items.find(function (i) { return i.id === id; });
    if (!item) return;
    document.getElementById('pg-editor-heading').textContent = item.title       || 'Untitled';
    document.getElementById('pg-f-title').value              = item.title       || '';
    document.getElementById('pg-f-desc').value               = item.description || '';
    document.getElementById('pg-f-live-url').value           = item.live_url    || '';
    renderPgCoverPreview(item);
    renderPgMediaPreview(item);
  }

  function renderPgCoverPreview(item) {
    var wrap = document.getElementById('pg-cover-preview');
    wrap.innerHTML = '';
    if (!item || !item.cover_url) return;
    var img = document.createElement('img');
    img.src = item.cover_url; img.className = 'pg-media-thumb';
    wrap.appendChild(img);
    var btn = document.createElement('button');
    btn.className = 'btn-ghost btn-sm'; btn.textContent = 'Remove cover';
    btn.style.marginTop = '10px';
    btn.addEventListener('click', async function () {
      var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
      if (idx === -1) return;
      await deleteFile(pgState.items[idx].cover_url);
      pgState.items[idx].cover_url = null;
      renderPgCoverPreview(pgState.items[idx]);
    });
    wrap.appendChild(btn);
  }

  function renderPgMediaPreview(item) {
    var wrap = document.getElementById('pg-media-preview');
    wrap.innerHTML = '';
    if (!item || !item.media_url) return;
    var el;
    if (item.media_type === 'video') {
      el = document.createElement('video');
      el.controls = true; el.muted = true; el.src = item.media_url;
    } else {
      el = document.createElement('img');
      el.src = item.media_url;
    }
    el.className = 'pg-media-thumb';
    wrap.appendChild(el);
    var btn = document.createElement('button');
    btn.className = 'btn-ghost btn-sm'; btn.textContent = 'Remove media';
    btn.style.marginTop = '10px';
    btn.addEventListener('click', async function () {
      var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
      if (idx === -1) return;
      await deleteFile(pgState.items[idx].media_url);
      pgState.items[idx].media_url  = null;
      pgState.items[idx].media_type = null;
      renderPgMediaPreview(pgState.items[idx]);
    });
    wrap.appendChild(btn);
  }

  // ── File upload ──────────────────────────────────────────────────────────────

  async function handlePgCoverFile(file) {
    if (!file.type.startsWith('image/')) return;
    pgToast('Uploading…');
    try {
      var url = await uploadFile(file, 'covers');
      var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
      if (idx === -1) return;
      pgState.items[idx].cover_url = url;
      renderPgCoverPreview(pgState.items[idx]);
      pgToast('Cover uploaded');
    } catch (e) { pgToast('Upload failed: ' + e.message); }
  }

  async function handlePgFile(file) {
    var isVideo = file.type.startsWith('video/');
    var isImage = file.type.startsWith('image/');
    if (!isImage && !isVideo) return;
    if (file.size > PG_MAX_FILE_BYTES) { pgToast('File too large — max 100 MB'); return; }
    pgToast('Uploading…');
    try {
      var url = await uploadFile(file, isVideo ? 'videos' : 'images', 'pg-upload-progress');
      var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
      if (idx === -1) return;
      pgState.items[idx].media_url  = url;
      pgState.items[idx].media_type = isVideo ? 'video' : 'image';
      renderPgMediaPreview(pgState.items[idx]);
      renderPgList();
      pgToast('Media uploaded');
    } catch (e) { pgToast('Upload failed: ' + e.message); }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async function savePgItem() {
    var title = document.getElementById('pg-f-title').value.trim();
    var desc  = document.getElementById('pg-f-desc').value.trim();
    if (!title) { pgToast('Title is required'); return; }
    var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
    if (idx === -1) { pgToast('Item not found'); return; }
    pgState.items[idx].title       = title;
    pgState.items[idx].description = desc;
    pgState.items[idx].live_url    = document.getElementById('pg-f-live-url').value.trim() || null;
    pgState.items[idx].sort_order  = idx;
    document.getElementById('pg-editor-heading').textContent = title;
    var { error } = await _sb.from('playground_items').upsert(pgState.items[idx]);
    if (error) { pgToast('Save failed: ' + error.message); return; }
    renderPgList();
    pgToast('Saved ✓');
  }

  async function deletePgItem() {
    if (!pgState.activeId) return;
    var item = pgState.items.find(function (x) { return x.id === pgState.activeId; });
    if (!confirm('Delete "' + (item && item.title ? item.title : 'this item') + '"?')) return;
    if (item) { await deleteFile(item.cover_url); await deleteFile(item.media_url); }
    var { error } = await _sb.from('playground_items').delete().eq('id', pgState.activeId);
    if (error) { pgToast('Delete failed: ' + error.message); return; }
    pgState.items    = pgState.items.filter(function (x) { return x.id !== pgState.activeId; });
    pgState.activeId = null;
    renderPgList();
    document.getElementById('pg-editor').style.display      = 'none';
    document.getElementById('pg-empty-state').style.display = 'flex';
    pgToast('Deleted');
  }

  function newPgItem() {
    var id   = pgUid();
    var item = { id: id, title: '', description: '', live_url: null, media_url: null, media_type: null, cover_url: null, sort_order: pgState.items.length };
    pgState.items.push(item);
    renderPgList();
    selectPgItem(id);
    document.getElementById('pg-f-title').focus();
    pgToast('New item — fill in the details and save');
  }

  // ── Bind events ──────────────────────────────────────────────────────────────

  function bindPgEvents() {
    var coverZone  = document.getElementById('pg-cover-zone');
    var coverInput = document.getElementById('pg-cover-input');
    var zone  = document.getElementById('pg-upload-zone');
    var input = document.getElementById('pg-upload-input');

    coverInput.addEventListener('change', function () { if (this.files[0]) handlePgCoverFile(this.files[0]); this.value = ''; });
    coverZone.addEventListener('dragover',  function (e) { e.preventDefault(); this.classList.add('drag-over'); });
    coverZone.addEventListener('dragleave', function ()  { this.classList.remove('drag-over'); });
    coverZone.addEventListener('drop',      function (e) {
      e.preventDefault(); this.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handlePgCoverFile(e.dataTransfer.files[0]);
    });

    input.addEventListener('change', function () { if (this.files[0]) handlePgFile(this.files[0]); this.value = ''; });
    zone.addEventListener('dragover',  function (e) { e.preventDefault(); this.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function ()  { this.classList.remove('drag-over'); });
    zone.addEventListener('drop',      function (e) {
      e.preventDefault(); this.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handlePgFile(e.dataTransfer.files[0]);
    });

    document.getElementById('pg-f-title').addEventListener('input', function () {
      document.getElementById('pg-editor-heading').textContent = this.value || 'Untitled';
    });

    document.getElementById('pg-btn-save').addEventListener('click', savePgItem);
    document.getElementById('pg-btn-delete').addEventListener('click', deletePgItem);
    document.getElementById('pg-btn-new').addEventListener('click', newPgItem);

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        var pgPanel = document.getElementById('playground-panel');
        if (pgPanel && pgPanel.style.display !== 'none') {
          e.preventDefault(); savePgItem();
        }
      }
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  async function pgInit() {
    initTabs();
    bindPgEvents();
    try {
      var { data, error } = await _sb.from('playground_items')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!error && data) pgState.items = data;
      else if (error) pgToast('DB error: ' + error.message);
    } catch (e) {
      pgToast('Could not connect to Supabase — check supabase-config.js');
    }
    renderPgList();
  }

  pgInit();

})();

// ── Articles tab ─────────────────────────────────────────────────────────────
(function () {

  var _sb        = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var ART_BUCKET = 'articles';

  var artState = { items: [], activeId: null };

  function artEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function artToast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  async function artUploadFile(file) {
    var ext  = file.name.split('.').pop().toLowerCase();
    var path = 'covers/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    var { error } = await _sb.storage.from(ART_BUCKET).upload(path, file);
    if (error) throw error;
    return _sb.storage.from(ART_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function artDeleteFile(url) {
    if (!url) return;
    try {
      var marker = '/object/public/' + ART_BUCKET + '/';
      var i = url.indexOf(marker);
      if (i !== -1) await _sb.storage.from(ART_BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]);
    } catch (e) {}
  }

  // ── List ───────────────────────────────────────────────────────────────────

  function renderArtList() {
    var list = document.getElementById('art-item-list');
    list.innerHTML = '';
    artState.items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'project-list-item' + (item.id === artState.activeId ? ' active' : '');
      li.dataset.id = item.id;
      li.innerHTML =
        '<div class="pli-text">' +
          '<p class="pli-title">' + artEsc(item.title || 'Untitled') + '</p>' +
          '<p class="pli-meta">'  + artEsc(item.date  || '')         + '</p>' +
        '</div>';
      li.addEventListener('click', function () { selectArtItem(item.id); });
      list.appendChild(li);
    });
  }

  // ── Select / populate ──────────────────────────────────────────────────────

  function selectArtItem(id) {
    artState.activeId = id;
    document.querySelectorAll('#art-item-list .project-list-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.id === id);
    });
    populateArtEditor(id);
    document.getElementById('art-empty-state').style.display = 'none';
    document.getElementById('art-editor').style.display      = 'block';
  }

  function populateArtEditor(id) {
    var item = artState.items.find(function (i) { return i.id === id; });
    if (!item) return;
    document.getElementById('art-editor-heading').textContent = item.title       || 'Untitled';
    document.getElementById('art-f-title').value              = item.title       || '';
    document.getElementById('art-f-desc').value               = item.description || '';
    document.getElementById('art-f-date').value               = item.date        || '';
    document.getElementById('art-f-url').value                = item.url         || '';
    renderArtCoverPreview(item);
  }

  function renderArtCoverPreview(item) {
    var wrap = document.getElementById('art-cover-preview');
    wrap.innerHTML = '';
    if (!item || !item.cover_url) return;
    var img = document.createElement('img');
    img.src = item.cover_url; img.className = 'pg-media-thumb';
    wrap.appendChild(img);
    var btn = document.createElement('button');
    btn.className = 'btn-ghost btn-sm'; btn.textContent = 'Remove cover';
    btn.style.marginTop = '10px';
    btn.addEventListener('click', async function () {
      var idx = artState.items.findIndex(function (x) { return x.id === artState.activeId; });
      if (idx === -1) return;
      await artDeleteFile(artState.items[idx].cover_url);
      artState.items[idx].cover_url = null;
      renderArtCoverPreview(artState.items[idx]);
    });
    wrap.appendChild(btn);
  }

  // ── Cover upload ───────────────────────────────────────────────────────────

  async function handleArtCover(file) {
    if (!file.type.startsWith('image/')) return;
    artToast('Uploading…');
    try {
      var url = await artUploadFile(file);
      var idx = artState.items.findIndex(function (x) { return x.id === artState.activeId; });
      if (idx === -1) return;
      if (artState.items[idx].cover_url) await artDeleteFile(artState.items[idx].cover_url);
      artState.items[idx].cover_url = url;
      renderArtCoverPreview(artState.items[idx]);
      artToast('Cover uploaded');
    } catch (e) { artToast('Upload failed: ' + e.message); }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async function saveArtItem() {
    var title = document.getElementById('art-f-title').value.trim();
    if (!title) { artToast('Title is required'); return; }
    var idx = artState.items.findIndex(function (x) { return x.id === artState.activeId; });
    if (idx === -1) { artToast('Item not found'); return; }
    artState.items[idx].title       = title;
    artState.items[idx].description = document.getElementById('art-f-desc').value.trim();
    artState.items[idx].date        = document.getElementById('art-f-date').value.trim();
    artState.items[idx].url         = document.getElementById('art-f-url').value.trim();
    artState.items[idx].sort_order  = idx;
    document.getElementById('art-editor-heading').textContent = title;
    var { error } = await _sb.from('articles').upsert(artState.items[idx]);
    if (error) { artToast('Save failed: ' + error.message); return; }
    renderArtList();
    artToast('Saved ✓');
  }

  async function deleteArtItem() {
    if (!artState.activeId) return;
    var item = artState.items.find(function (x) { return x.id === artState.activeId; });
    if (!confirm('Delete "' + (item && item.title ? item.title : 'this article') + '"?')) return;
    if (item && item.cover_url) await artDeleteFile(item.cover_url);
    var { error } = await _sb.from('articles').delete().eq('id', artState.activeId);
    if (error) { artToast('Delete failed: ' + error.message); return; }
    artState.items    = artState.items.filter(function (x) { return x.id !== artState.activeId; });
    artState.activeId = null;
    renderArtList();
    document.getElementById('art-editor').style.display      = 'none';
    document.getElementById('art-empty-state').style.display = 'flex';
    artToast('Deleted');
  }

  function newArtItem() {
    var id = 'art_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    artState.items.push({ id: id, title: '', description: '', date: '', url: '', cover_url: null, sort_order: artState.items.length });
    renderArtList();
    selectArtItem(id);
    document.getElementById('art-f-title').focus();
    artToast('New article — fill in the details and save');
  }

  // ── Bind events ────────────────────────────────────────────────────────────

  function bindArtEvents() {
    var zone  = document.getElementById('art-cover-zone');
    var input = document.getElementById('art-cover-input');
    input.addEventListener('change', function () { if (this.files[0]) handleArtCover(this.files[0]); this.value = ''; });
    zone.addEventListener('dragover',  function (e) { e.preventDefault(); this.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function ()  { this.classList.remove('drag-over'); });
    zone.addEventListener('drop',      function (e) {
      e.preventDefault(); this.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleArtCover(e.dataTransfer.files[0]);
    });
    document.getElementById('art-f-title').addEventListener('input', function () {
      document.getElementById('art-editor-heading').textContent = this.value || 'Untitled';
    });
    document.getElementById('art-btn-save').addEventListener('click', saveArtItem);
    document.getElementById('art-btn-delete').addEventListener('click', deleteArtItem);
    document.getElementById('art-btn-new').addEventListener('click', newArtItem);
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        if (document.getElementById('articles-panel').style.display !== 'none') {
          e.preventDefault(); saveArtItem();
        }
      }
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  async function artInit() {
    bindArtEvents();
    try {
      var { data, error } = await _sb.from('articles')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!error && data) artState.items = data;
      else if (error) artToast('DB error: ' + error.message);
    } catch (e) {
      artToast('Could not connect to Supabase');
    }
    renderArtList();
  }

  artInit();

})();

// ── Carousel tab ──────────────────────────────────────────────────────────────
(function () {

  var _sb   = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var BUCKET = 'carousel';
  var CAR_MAX = 100 * 1024 * 1024;

  var carState = { home: [], about: [] };
  var carDrag  = { page: null, fromIndex: -1 };

  function carToast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function carUploadFile(file, page, progressId) {
    return new Promise(function (resolve, reject) {
      var ext  = file.name.split('.').pop().toLowerCase();
      var path = page + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
      var endpoint = SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path;

      var bar  = progressId ? document.getElementById(progressId) : null;
      var fill = bar ? bar.querySelector('.upload-progress-fill') : null;
      var pct  = bar ? bar.querySelector('[id$="-pct"]') : null;
      var name = bar ? bar.querySelector('[id$="-name"]') : null;
      if (bar)  { bar.classList.add('active'); }
      if (fill) { fill.style.width = '0%'; }
      if (pct)  { pct.textContent = '0%'; }
      if (name) { name.textContent = file.name; }

      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.addEventListener('progress', function (e) {
        if (!e.lengthComputable) return;
        var p = Math.round((e.loaded / e.total) * 100);
        if (fill) fill.style.width = p + '%';
        if (pct)  pct.textContent  = p + '%';
      });

      xhr.addEventListener('load', function () {
        if (bar) bar.classList.remove('active');
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + path);
        } else {
          var msg = 'Upload failed (' + xhr.status + ')';
          try { var body = JSON.parse(xhr.responseText); msg = body.error || body.message || msg; } catch (_) {}
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', function () {
        if (bar) bar.classList.remove('active');
        reject(new Error('Network error during upload'));
      });

      xhr.send(file);
    });
  }

  async function deleteCarFile(url) {
    if (!url) return;
    try {
      var marker = '/object/public/' + BUCKET + '/';
      var i = url.indexOf(marker);
      if (i !== -1) await _sb.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]);
    } catch (e) {}
  }

  async function saveCarOrder(page) {
    try {
      var updates = carState[page].map(function (item, i) {
        return { id: item.id, url: item.url, page: item.page, sort_order: i, crop: item.crop || null };
      });
      var res = await _sb.from('carousel_images').upsert(updates);
      if (res.error) throw res.error;
    } catch (e) {
      carToast('Could not save order: ' + e.message);
    }
  }

  function renderCarGrid(page) {
    var grid = document.getElementById('car-' + page + '-grid');
    if (!grid) return;
    var items = carState[page];
    if (!items.length) {
      grid.innerHTML = '<p class="car-empty">No images yet. Upload some above.</p>';
      return;
    }
    grid.innerHTML = '';
    items.forEach(function (item, index) {
      var div = document.createElement('div');
      div.className = 'car-img-item';
      div.draggable = true;

      var img = document.createElement('img');
      img.src = item.url;
      img.alt = '';
      if (item.crop && item.crop.x !== undefined) {
        img.style.objectPosition = item.crop.x + '% ' + item.crop.y + '%';
      }

      var cropBtn = document.createElement('button');
      cropBtn.className = 'car-crop-btn';
      cropBtn.title = 'Crop';
      cropBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 2 6 6 2 6"/><polyline points="18 22 18 18 22 18"/><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
      cropBtn.addEventListener('click', function (e) { e.stopPropagation(); openCropModal(page, index); });

      var btn = document.createElement('button');
      btn.className = 'car-delete-btn';
      btn.title = 'Remove';
      btn.innerHTML = '&times;';
      btn.addEventListener('click', function () { removeCarImage(item.id, item.url, page); });

      div.appendChild(img);
      div.appendChild(cropBtn);
      div.appendChild(btn);
      if (item.crop && item.crop.x !== undefined) {
        var badge = document.createElement('span');
        badge.className = 'car-crop-badge';
        badge.textContent = 'Cropped';
        div.appendChild(badge);
      }

      div.addEventListener('dragstart', function (e) {
        e.dataTransfer.effectAllowed = 'move';
        carDrag.page      = page;
        carDrag.fromIndex = index;
        div.classList.add('car-dragging');
      });

      div.addEventListener('dragend', function () {
        div.classList.remove('car-dragging');
        grid.querySelectorAll('.car-img-item').forEach(function (el) { el.classList.remove('car-drag-over'); });
      });

      div.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (carDrag.page !== page) return;
        grid.querySelectorAll('.car-img-item').forEach(function (el) { el.classList.remove('car-drag-over'); });
        div.classList.add('car-drag-over');
      });

      div.addEventListener('dragleave', function () {
        div.classList.remove('car-drag-over');
      });

      div.addEventListener('drop', function (e) {
        e.preventDefault();
        div.classList.remove('car-drag-over');
        var toIndex = index;
        if (carDrag.page !== page || carDrag.fromIndex === toIndex) return;
        var arr   = carState[page];
        var moved = arr.splice(carDrag.fromIndex, 1)[0];
        arr.splice(toIndex, 0, moved);
        renderCarGrid(page);
        saveCarOrder(page);
      });

      grid.appendChild(div);
    });
  }

  async function removeCarImage(id, url, page) {
    carToast('Deleting…');
    try {
      var res = await _sb.from('carousel_images').delete().eq('id', id);
      if (res.error) throw res.error;
      await deleteCarFile(url);
      carState[page] = carState[page].filter(function (i) { return i.id !== id; });
      renderCarGrid(page);
      carToast('Deleted');
    } catch (e) {
      carToast('Delete failed: ' + e.message);
    }
  }

  async function handleCarUpload(files, page) {
    var progressId = 'car-' + page + '-progress';
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.size > CAR_MAX) { carToast(file.name + ' is too large (max 100 MB)'); continue; }
      try {
        carToast('Uploading ' + (i + 1) + ' of ' + files.length + '…');
        var url = await carUploadFile(file, page, progressId);
        var existing = carState[page];
        var order = existing.length ? Math.max.apply(null, existing.map(function (x) { return x.sort_order || 0; })) + 1 : 0;
        var id  = page + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        var res = await _sb.from('carousel_images').insert({ id: id, url: url, page: page, sort_order: order });
        if (res.error) throw res.error;
        carState[page].push({ id: id, url: url, page: page, sort_order: order });
        renderCarGrid(page);
      } catch (e) {
        carToast('Upload failed: ' + e.message);
      }
    }
    if (files.length > 1) carToast('Done uploading');
  }

  // ── Crop modal ────────────────────────────────────────────────────────────────

  var cropState = {
    page: null, index: null,
    rectW: 0, rectH: 0,
    rectX: 0, rectY: 0,
    maxX: 0,  maxY: 0,
    imgOffX: 0, imgOffY: 0,
    dragging: false,
    startMX: 0, startMY: 0, startRX: 0, startRY: 0
  };

  function openCropModal(page, index) {
    var item = carState[page][index];
    if (!item) return;
    cropState.page  = page;
    cropState.index = index;
    var modal  = document.getElementById('crop-modal');
    var imgEl  = document.getElementById('crop-img');
    var rectEl = document.getElementById('crop-rect');
    rectEl.style.display = 'none';
    imgEl.src = '';
    modal.classList.add('active');

    function setupRect() {
      var wrap    = document.getElementById('crop-canvas-wrap');
      var wrapR   = wrap.getBoundingClientRect();
      var imgR    = imgEl.getBoundingClientRect();
      var RATIO   = 846 / 700;
      var dispW   = imgEl.offsetWidth;
      var dispH   = imgEl.offsetHeight;
      if (!dispW || !dispH) return;

      cropState.imgOffX = imgR.left - wrapR.left;
      cropState.imgOffY = imgR.top  - wrapR.top;

      if (dispW / dispH > RATIO) {
        cropState.rectH = dispH;
        cropState.rectW = dispH * RATIO;
      } else {
        cropState.rectW = dispW;
        cropState.rectH = dispW / RATIO;
      }
      cropState.maxX = dispW - cropState.rectW;
      cropState.maxY = dispH - cropState.rectH;

      var crop = item.crop;
      if (crop && crop.x !== undefined) {
        cropState.rectX = cropState.maxX > 0 ? (crop.x / 100) * cropState.maxX : 0;
        cropState.rectY = cropState.maxY > 0 ? (crop.y / 100) * cropState.maxY : 0;
      } else {
        cropState.rectX = cropState.maxX / 2;
        cropState.rectY = cropState.maxY / 2;
      }
      updateCropRect();
      rectEl.style.display = 'block';
    }

    if (imgEl.complete && imgEl.naturalWidth) {
      requestAnimationFrame(setupRect);
    } else {
      imgEl.onload = function () { requestAnimationFrame(setupRect); };
    }
    imgEl.src = item.url;
  }

  function updateCropRect() {
    var rectEl = document.getElementById('crop-rect');
    rectEl.style.left   = (cropState.imgOffX + cropState.rectX) + 'px';
    rectEl.style.top    = (cropState.imgOffY + cropState.rectY) + 'px';
    rectEl.style.width  = cropState.rectW + 'px';
    rectEl.style.height = cropState.rectH + 'px';
  }

  function closeCropModal() {
    document.getElementById('crop-modal').classList.remove('active');
  }

  function bindCropDrag() {
    var rectEl = document.getElementById('crop-rect');
    var wrap   = document.getElementById('crop-canvas-wrap');

    function startDrag(clientX, clientY) {
      cropState.dragging = true;
      cropState.startMX  = clientX;
      cropState.startMY  = clientY;
      cropState.startRX  = cropState.rectX;
      cropState.startRY  = cropState.rectY;
    }

    function moveDrag(clientX, clientY) {
      if (!cropState.dragging) return;
      var dx = clientX - cropState.startMX;
      var dy = clientY - cropState.startMY;
      cropState.rectX = Math.min(cropState.maxX, Math.max(0, cropState.startRX + dx));
      cropState.rectY = Math.min(cropState.maxY, Math.max(0, cropState.startRY + dy));
      updateCropRect();
    }

    function stopDrag() { cropState.dragging = false; }

    rectEl.addEventListener('mousedown', function (e) { e.preventDefault(); startDrag(e.clientX, e.clientY); });
    document.addEventListener('mousemove', function (e) { moveDrag(e.clientX, e.clientY); });
    document.addEventListener('mouseup', stopDrag);

    rectEl.addEventListener('touchstart', function (e) { var t = e.touches[0]; startDrag(t.clientX, t.clientY); }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!cropState.dragging) return;
      e.preventDefault();
      var t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    }, { passive: false });
    document.addEventListener('touchend', stopDrag);

    document.getElementById('crop-cancel-btn').addEventListener('click', closeCropModal);

    document.getElementById('crop-reset-btn').addEventListener('click', function () {
      cropState.rectX = cropState.maxX / 2;
      cropState.rectY = cropState.maxY / 2;
      updateCropRect();
    });

    document.getElementById('crop-apply-btn').addEventListener('click', async function () {
      var x    = cropState.maxX > 0 ? Math.round(cropState.rectX / cropState.maxX * 100) : 50;
      var y    = cropState.maxY > 0 ? Math.round(cropState.rectY / cropState.maxY * 100) : 50;
      var crop = { x: x, y: y };
      var page  = cropState.page;
      var index = cropState.index;
      var item  = carState[page][index];
      if (!item) return;
      item.crop = crop;
      try {
        var res = await _sb.from('carousel_images').update({ crop: crop }).eq('id', item.id);
        if (res.error) throw res.error;
        carToast('Crop saved ✓');
      } catch (e) {
        carToast('Save failed: ' + e.message);
      }
      renderCarGrid(page);
      closeCropModal();
    });

    document.getElementById('crop-modal').addEventListener('click', function (e) {
      if (e.target === this) closeCropModal();
    });
  }

  function bindCarEvents() {
    ['home', 'about'].forEach(function (page) {
      var zone  = document.getElementById('car-' + page + '-zone');
      var input = document.getElementById('car-' + page + '-input');
      if (!zone || !input) return;

      input.addEventListener('change', function () {
        if (this.files && this.files.length) handleCarUpload(this.files, page);
        this.value = '';
      });

      zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) handleCarUpload(e.dataTransfer.files, page);
      });
    });
  }

  async function carInit() {
    bindCarEvents();
    bindCropDrag();
    try {
      var res = await _sb.from('carousel_images').select('*').order('sort_order', { ascending: true });
      if (res.error) throw res.error;
      carState.home  = (res.data || []).filter(function (i) { return i.page === 'home'; });
      carState.about = (res.data || []).filter(function (i) { return i.page === 'about'; });
    } catch (e) {
      carToast('Could not load carousel images');
    }
    renderCarGrid('home');
    renderCarGrid('about');
  }

  carInit();

})();
