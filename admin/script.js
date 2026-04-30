(function () {

  // ── Auth ────────────────────────────────────
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

  // ── State ───────────────────────────────────
  var STORAGE_KEY = 'portfolio_projects';
  var ORDER_KEY   = 'portfolio_project_order';

  var state = {
    projects:  {},
    order:     [],   // explicit render order (array of project IDs)
    activeId:  null,
    isNew:     false,
    gallery:   [],
    coverId:   null
  };

  var dragSrcIdx     = null;  // gallery drag
  var sidebarDragSrc = null;  // sidebar project reorder drag

  // ── Init ────────────────────────────────────
  function init() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { state.projects = JSON.parse(stored); }
      catch (e) { state.projects = deepClone(PROJECTS); }
    } else {
      state.projects = deepClone(PROJECTS);
    }
    var storedOrder = localStorage.getItem(ORDER_KEY);
    if (storedOrder) {
      try { state.order = JSON.parse(storedOrder); }
      catch (e) { state.order = []; }
    }
    normalizeOrder();
    renderList();
    if (state.order.length) selectProject(state.order[0]);
    bindGlobalEvents();
  }

  // ── Helpers ─────────────────────────────────
  function deepClone(o)   { return JSON.parse(JSON.stringify(o)); }
  function persist()      { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects)); }
  function persistOrder() { localStorage.setItem(ORDER_KEY, JSON.stringify(state.order)); }
  function slugify(s)     { return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }
  function uid()          { return 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
  function esc(s)         {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Keeps state.order in sync with state.projects keys
  function normalizeOrder() {
    var keys = Object.keys(state.projects);
    state.order = state.order.filter(function (id) { return !!state.projects[id]; });
    keys.forEach(function (id) {
      if (state.order.indexOf(id) === -1) state.order.push(id);
    });
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  // ── Project list (sidebar) ───────────────────
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

      // Select on click (but not on the drag handle)
      li.addEventListener('click', function (e) {
        if (e.target.closest('.pli-drag')) return;
        selectProject(id);
      });

      // Sidebar drag-to-reorder
      li.addEventListener('dragstart', function (e) {
        sidebarDragSrc = idx;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(function () { li.classList.add('is-dragging'); }, 0);
      });
      li.addEventListener('dragend', function () {
        sidebarDragSrc = null;
        li.classList.remove('is-dragging');
        document.querySelectorAll('.project-list-item').forEach(function (el) {
          el.classList.remove('drag-over');
        });
      });
      li.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      li.addEventListener('dragenter', function (e) {
        e.preventDefault();
        if (sidebarDragSrc !== null && sidebarDragSrc !== idx) li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', function () {
        li.classList.remove('drag-over');
      });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (sidebarDragSrc === null || sidebarDragSrc === idx) return;
        var moved = state.order.splice(sidebarDragSrc, 1)[0];
        state.order.splice(idx, 0, moved);
        persistOrder();
        renderList();
        toast('Order saved');
      });

      list.appendChild(li);
    });
  }

  // ── Select project ───────────────────────────
  function selectProject(id) {
    state.activeId = id;
    state.isNew    = false;
    document.querySelectorAll('.project-list-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.id === id);
    });
    populateEditor(id);
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('editor').style.display      = 'block';
  }

  // ── Populate editor ──────────────────────────
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
    document.getElementById('f-live-url').value = p.liveUrl  || '';
    document.getElementById('slug-preview').textContent = id;

    state.gallery = (p.gallery || []).map(function (item) {
      if (item.type === 'full')  return { imageId: item.imageId || null, src: item.src || null, alt: item.alt || '', layout: 'full', mediaType: item.mediaType || 'image' };
      if (item.type === 'pair')  return [
        { imageId: (item.images[0] || {}).imageId || null, src: (item.images[0] || {}).src || null, alt: (item.images[0] || {}).alt || '', layout: 'half', mediaType: (item.images[0] || {}).mediaType || 'image' },
        { imageId: (item.images[1] || {}).imageId || null, src: (item.images[1] || {}).src || null, alt: (item.images[1] || {}).alt || '', layout: 'half', mediaType: (item.images[1] || {}).mediaType || 'image' }
      ];
      return item;
    }).flat();
    state.coverId = p.coverImageId || null;

    renderGalleryGrid();
  }

  // ── Gallery grid ─────────────────────────────
  function renderGalleryGrid() {
    var grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';

    state.gallery.forEach(function (item, idx) {
      var isVideo   = item.mediaType === 'video';
      var isCover   = !!(state.coverId && item.imageId && item.imageId === state.coverId);
      var card      = document.createElement('div');
      card.className    = 'gcard' + (isCover ? ' is-cover' : '');
      card.dataset.idx  = idx;

      var mediaHtml = isVideo
        ? '<video class="gcard-img" muted preload="metadata" loop playsinline></video>'
        : '<img class="gcard-img" src="" alt="" />';

      var coverBtnHtml = isVideo
        ? ''
        : '<button class="gcard-cover-btn" title="Set as cover">★</button>';

      var videoBadgeHtml = isVideo
        ? '<span class="gcard-video-badge">Video</span>'
        : '';

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
      card.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      card.addEventListener('dragenter', function () {
        if (dragSrcIdx !== null && dragSrcIdx !== idx) card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', function () {
        card.classList.remove('drag-over');
      });
      card.addEventListener('drop', function (e) {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (dragSrcIdx === null || dragSrcIdx === idx) return;
        var moved = state.gallery.splice(dragSrcIdx, 1)[0];
        state.gallery.splice(idx, 0, moved);
        renderGalleryGrid();
      });

      var mediaEl = card.querySelector('.gcard-img');
      if (item.imageId) {
        ImageDB.get(item.imageId).then(function (rec) {
          if (rec) mediaEl.src = rec.dataUrl;
        });
      } else if (item.src) {
        mediaEl.src = item.src;
      }

      var coverBtn = card.querySelector('.gcard-cover-btn');
      if (coverBtn) {
        coverBtn.addEventListener('click', function () {
          if (!item.imageId) { toast('Re-upload this image to use it as cover'); return; }
          state.coverId = item.imageId;
          document.querySelectorAll('.gcard').forEach(function (c) {
            var cIdx  = parseInt(c.dataset.idx);
            var cItem = state.gallery[cIdx];
            c.classList.toggle('is-cover', !!(state.coverId && cItem && cItem.imageId === state.coverId));
          });
          toast('Cover image set');
        });
      }

      card.querySelector('.gcard-remove-btn').addEventListener('click', function () {
        if (item.imageId && item.imageId === state.coverId) state.coverId = null;
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

  // ── File upload ──────────────────────────────
  function handleFiles(files) {
    if (!files || !files.length) return;
    Array.from(files).forEach(function (file) {
      var isVideo = file.type.startsWith('video/');
      var isImage = file.type.startsWith('image/');
      if (!isImage && !isVideo) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = e.target.result;
        var id      = uid();
        ImageDB.save(id, dataUrl, file.name).then(function () {
          state.gallery.push({ imageId: id, src: null, alt: file.name.replace(/\.[^.]+$/, ''), layout: 'full', mediaType: isVideo ? 'video' : 'image' });
          if (!state.coverId && isImage) state.coverId = id;
          renderGalleryGrid();
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Convert gallery state → project format ───
  function galleryToProjectFormat() {
    var result  = [];
    var i       = 0;
    while (i < state.gallery.length) {
      var item = state.gallery[i];
      if (item.layout === 'half' && state.gallery[i + 1] && state.gallery[i + 1].layout === 'half') {
        result.push({ type: 'pair', images: [
          { imageId: item.imageId, src: item.src, alt: item.alt, mediaType: item.mediaType || 'image' },
          { imageId: state.gallery[i + 1].imageId, src: state.gallery[i + 1].src, alt: state.gallery[i + 1].alt, mediaType: state.gallery[i + 1].mediaType || 'image' }
        ]});
        i += 2;
      } else {
        result.push({ type: 'full', imageId: item.imageId, src: item.src, alt: item.alt, mediaType: item.mediaType || 'image' });
        i++;
      }
    }
    return result;
  }

  // ── Read form ─────────────────────────────────
  function readForm() {
    return {
      title:        document.getElementById('f-title').value.trim(),
      tagline:      document.getElementById('f-tagline').value.trim(),
      about:        document.getElementById('f-about').value.trim(),
      industry:     document.getElementById('f-industry').value.trim(),
      role:         document.getElementById('f-role').value.trim(),
      year:         document.getElementById('f-year').value.trim(),
      meta:         document.getElementById('f-meta').value.trim(),
      liveUrl:      document.getElementById('f-live-url').value.trim() || null,
      coverImageId: state.coverId || null,
      gallery:      galleryToProjectFormat()
    };
  }

  // ── Save project ──────────────────────────────
  function saveProject() {
    var newSlug = slugify(document.getElementById('f-slug').value.trim());
    if (!newSlug) { toast('Slug is required'); return; }
    var data = readForm();
    if (!data.title) { toast('Title is required'); return; }
    var oldId = state.activeId;

    if (state.isNew) {
      // New project: replace temp key with real slug in order
      var tempIdx = state.order.indexOf(oldId);
      if (tempIdx !== -1) state.order[tempIdx] = newSlug;
      else state.order.push(newSlug);
      delete state.projects[oldId];
    } else if (newSlug !== oldId) {
      // Slug renamed: swap in order
      var orderIdx = state.order.indexOf(oldId);
      if (orderIdx !== -1) state.order[orderIdx] = newSlug;
      delete state.projects[oldId];
    }

    state.projects[newSlug] = data;
    state.activeId = newSlug;
    state.isNew    = false;
    persist();
    persistOrder();
    renderList();
    selectProject(newSlug);
    toast('Project saved ✓');
  }

  // ── Delete project ────────────────────────────
  function deleteProject() {
    if (!state.activeId) return;
    if (!confirm('Delete "' + (state.projects[state.activeId].title || state.activeId) + '"?')) return;
    state.order = state.order.filter(function (id) { return id !== state.activeId; });
    delete state.projects[state.activeId];
    state.activeId = null;
    persist();
    persistOrder();
    renderList();
    document.getElementById('editor').style.display      = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    if (state.order.length) selectProject(state.order[0]);
    toast('Project deleted');
  }

  // ── New project ───────────────────────────────
  function newProject() {
    state.isNew  = true;
    var tempId   = 'new-project-' + Date.now();
    state.projects[tempId] = {
      title: '', tagline: '', about: '',
      industry: '', role: '', year: '',
      meta: '', coverImageId: null, gallery: []
    };
    state.order.push(tempId);
    persist();
    persistOrder();
    renderList();
    selectProject(tempId);
    document.getElementById('f-slug').value = '';
    document.getElementById('f-slug').focus();
    toast('New project — fill in the details and save');
  }

  // ── Export projects.js ────────────────────────
  async function exportProjects() {
    if (state.activeId) {
      state.projects[state.activeId] = Object.assign(state.projects[state.activeId], readForm());
    }

    // Build export object in the current sidebar order
    var exported = {};
    state.order.forEach(function (id) {
      if (state.projects[id]) exported[id] = deepClone(state.projects[id]);
    });

    var promises = [];
    Object.values(exported).forEach(function (p) {
      (p.gallery || []).forEach(function (section) {
        if (section.type === 'full' && section.imageId) {
          promises.push(
            ImageDB.get(section.imageId).then(function (rec) {
              if (rec) { section.src = rec.dataUrl; }
              delete section.imageId;
            })
          );
        } else if (section.type === 'pair') {
          (section.images || []).forEach(function (img) {
            if (img.imageId) {
              promises.push(
                ImageDB.get(img.imageId).then(function (rec) {
                  if (rec) { img.src = rec.dataUrl; }
                  delete img.imageId;
                })
              );
            }
          });
        }
      });
      if (p.coverImageId) {
        promises.push(
          ImageDB.get(p.coverImageId).then(function (rec) {
            p.coverSrc = rec ? rec.dataUrl : null;
            delete p.coverImageId;
          })
        );
      }
    });

    await Promise.all(promises);

    var content = 'var PROJECTS = ' + JSON.stringify(exported, null, 2) + ';\n';
    var blob    = new Blob([content], { type: 'text/javascript' });
    var url     = URL.createObjectURL(blob);
    var a       = document.createElement('a');
    a.href = url; a.download = 'projects.js';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Exported — replace /data/projects.js with the downloaded file');
  }

  // ── Bind events ───────────────────────────────
  function bindGlobalEvents() {
    var zone  = document.getElementById('upload-zone');
    var input = document.getElementById('upload-input');

    input.addEventListener('change', function () { handleFiles(this.files); this.value = ''; });

    zone.addEventListener('dragover', function (e) {
      e.preventDefault(); this.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', function () { this.classList.remove('drag-over'); });
    zone.addEventListener('drop', function (e) {
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
    document.getElementById('btn-export').addEventListener('click', exportProjects);

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveProject(); }
    });
  }

  init();

})();

// ── Playground tab ───────────────────────────────────────────────────────────
(function () {

  var PG_KEY = 'portfolio_playground';

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

  function pgPersist() { localStorage.setItem(PG_KEY, JSON.stringify(pgState.items)); }

  function pgToast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  // ── Tab switching ──────────────────────────────────────────────────────────

  function initTabs() {
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = this.dataset.panel;
        document.querySelectorAll('.admin-tab').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        document.getElementById('projects-panel').style.display    = panel === 'projects'   ? 'flex' : 'none';
        document.getElementById('playground-panel').style.display  = panel === 'playground' ? 'flex' : 'none';
        document.getElementById('articles-panel').style.display    = panel === 'articles'   ? 'flex' : 'none';
        document.getElementById('header-actions-projects').style.display   = panel === 'projects'   ? 'flex' : 'none';
        document.getElementById('header-actions-playground').style.display = panel === 'playground' ? 'flex' : 'none';
        document.getElementById('header-actions-articles').style.display   = panel === 'articles'   ? 'flex' : 'none';
      });
    });
  }

  // ── List ───────────────────────────────────────────────────────────────────

  function renderPgList() {
    var list = document.getElementById('pg-item-list');
    list.innerHTML = '';
    pgState.items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'project-list-item' + (item.id === pgState.activeId ? ' active' : '');
      li.dataset.id = item.id;
      li.innerHTML =
        '<div class="pli-text">' +
          '<p class="pli-title">' + pgEsc(item.title || 'Untitled') + '</p>' +
          '<p class="pli-meta">' + pgEsc(item.mediaType || '—') + '</p>' +
        '</div>';
      li.addEventListener('click', function () { selectPgItem(item.id); });
      list.appendChild(li);
    });
  }

  // ── Select / populate ──────────────────────────────────────────────────────

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
    document.getElementById('pg-editor-heading').textContent = item.title || 'Untitled';
    document.getElementById('pg-f-title').value = item.title || '';
    document.getElementById('pg-f-desc').value  = item.desc  || '';
    renderPgCoverPreview(item);
    renderPgMediaPreview(item);
  }

  function renderPgCoverPreview(item) {
    var wrap = document.getElementById('pg-cover-preview');
    wrap.innerHTML = '';
    if (!item || !item.coverId) return;
    ImageDB.get(item.coverId).then(function (rec) {
      if (!rec) return;
      var el = document.createElement('img');
      el.src = rec.dataUrl; el.className = 'pg-media-thumb';
      wrap.appendChild(el);
      var removeBtn = document.createElement('button');
      removeBtn.className = 'btn-ghost btn-sm'; removeBtn.textContent = 'Remove cover';
      removeBtn.style.marginTop = '10px';
      removeBtn.addEventListener('click', function () {
        var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
        if (idx !== -1) { pgState.items[idx].coverId = null; renderPgCoverPreview(pgState.items[idx]); }
      });
      wrap.appendChild(removeBtn);
    });
  }

  function renderPgMediaPreview(item) {
    var wrap = document.getElementById('pg-media-preview');
    wrap.innerHTML = '';
    if (!item || !item.mediaId) return;
    ImageDB.get(item.mediaId).then(function (rec) {
      if (!rec) return;
      var el;
      if (item.mediaType === 'video') {
        el = document.createElement('video');
        el.controls = true;
        el.muted = true;
        fetch(rec.dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
          el.src = URL.createObjectURL(blob);
        });
      } else {
        el = document.createElement('img');
        el.src = rec.dataUrl;
      }
      el.className = 'pg-media-thumb';
      wrap.appendChild(el);
      var removeBtn = document.createElement('button');
      removeBtn.className = 'btn-ghost btn-sm'; removeBtn.textContent = 'Remove media';
      removeBtn.style.marginTop = '10px';
      removeBtn.addEventListener('click', function () {
        var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
        if (idx === -1) return;
        pgState.items[idx].mediaId   = null;
        pgState.items[idx].mediaType = null;
        renderPgMediaPreview(pgState.items[idx]);
      });
      wrap.appendChild(removeBtn);
    });
  }

  // ── File upload ────────────────────────────────────────────────────────────

  function handlePgCoverFile(file) {
    if (!file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var coverId = 'pg_cover_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      ImageDB.save(coverId, e.target.result, file.name).then(function () {
        var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
        if (idx === -1) return;
        pgState.items[idx].coverId = coverId;
        renderPgCoverPreview(pgState.items[idx]);
        pgToast('Cover uploaded');
      });
    };
    reader.readAsDataURL(file);
  }

  function handlePgFile(file) {
    var isVideo = file.type.startsWith('video/');
    var isImage = file.type.startsWith('image/');
    if (!isImage && !isVideo) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var mediaId = 'pg_media_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      ImageDB.save(mediaId, e.target.result, file.name).then(function () {
        var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
        if (idx === -1) return;
        pgState.items[idx].mediaId   = mediaId;
        pgState.items[idx].mediaType = isVideo ? 'video' : 'image';
        renderPgMediaPreview(pgState.items[idx]);
        renderPgList();
        pgToast('Media uploaded');
      });
    };
    reader.readAsDataURL(file);
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  function savePgItem() {
    var title = document.getElementById('pg-f-title').value.trim();
    var desc  = document.getElementById('pg-f-desc').value.trim();
    if (!title) { pgToast('Title is required'); return; }
    var idx = pgState.items.findIndex(function (x) { return x.id === pgState.activeId; });
    if (idx === -1) { pgToast('Item not found'); return; }
    pgState.items[idx].title = title;
    pgState.items[idx].desc  = desc;
    document.getElementById('pg-editor-heading').textContent = title;
    pgPersist();
    renderPgList();
    pgToast('Saved ✓');
  }

  function deletePgItem() {
    if (!pgState.activeId) return;
    var item = pgState.items.find(function (x) { return x.id === pgState.activeId; });
    if (!confirm('Delete "' + (item && item.title ? item.title : 'this item') + '"?')) return;
    pgState.items = pgState.items.filter(function (x) { return x.id !== pgState.activeId; });
    pgState.activeId = null;
    pgPersist();
    renderPgList();
    document.getElementById('pg-editor').style.display      = 'none';
    document.getElementById('pg-empty-state').style.display = 'flex';
    pgToast('Deleted');
  }

  function newPgItem() {
    var id   = pgUid();
    var item = { id: id, title: '', desc: '', mediaId: null, mediaType: null };
    pgState.items.push(item);
    pgPersist();
    renderPgList();
    selectPgItem(id);
    document.getElementById('pg-f-title').focus();
    pgToast('New item — fill in the details and save');
  }

  // ── Bind events ────────────────────────────────────────────────────────────

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

  // ── Init ───────────────────────────────────────────────────────────────────

  function pgInit() {
    try {
      var stored = localStorage.getItem(PG_KEY);
      if (stored) pgState.items = JSON.parse(stored);
    } catch (e) { pgState.items = []; }
    initTabs();
    bindPgEvents();
    renderPgList();
  }

  pgInit();

})();

// ── Articles tab ─────────────────────────────────────────────────────────────
(function () {

  var ART_KEY = 'portfolio_articles';

  var artState = { items: [], activeId: null };

  function artUid() { return 'art_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
  function artEsc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function artPersist() { localStorage.setItem(ART_KEY, JSON.stringify(artState.items)); }
  function artToast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
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
    document.getElementById('art-editor-heading').textContent = item.title || 'Untitled';
    document.getElementById('art-f-title').value = item.title || '';
    document.getElementById('art-f-desc').value  = item.desc  || '';
    document.getElementById('art-f-date').value  = item.date  || '';
    document.getElementById('art-f-url').value   = item.url   || '';
    renderArtCoverPreview(item);
  }

  function renderArtCoverPreview(item) {
    var wrap = document.getElementById('art-cover-preview');
    wrap.innerHTML = '';
    if (!item || !item.coverId) return;
    ImageDB.get(item.coverId).then(function (rec) {
      if (!rec) return;
      var img = document.createElement('img');
      img.src = rec.dataUrl; img.className = 'pg-media-thumb';
      wrap.appendChild(img);
      var btn = document.createElement('button');
      btn.className = 'btn-ghost btn-sm'; btn.textContent = 'Remove cover';
      btn.style.marginTop = '10px';
      btn.addEventListener('click', function () {
        var idx = artState.items.findIndex(function (x) { return x.id === artState.activeId; });
        if (idx !== -1) { artState.items[idx].coverId = null; renderArtCoverPreview(artState.items[idx]); }
      });
      wrap.appendChild(btn);
    });
  }

  // ── Cover upload ───────────────────────────────────────────────────────────

  function handleArtCover(file) {
    if (!file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var coverId = 'art_cover_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      ImageDB.save(coverId, e.target.result, file.name).then(function () {
        var idx = artState.items.findIndex(function (x) { return x.id === artState.activeId; });
        if (idx === -1) return;
        artState.items[idx].coverId = coverId;
        renderArtCoverPreview(artState.items[idx]);
        artToast('Cover uploaded');
      });
    };
    reader.readAsDataURL(file);
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  function saveArtItem() {
    var title = document.getElementById('art-f-title').value.trim();
    if (!title) { artToast('Title is required'); return; }
    var idx = artState.items.findIndex(function (x) { return x.id === artState.activeId; });
    if (idx === -1) { artToast('Item not found'); return; }
    artState.items[idx].title = title;
    artState.items[idx].desc  = document.getElementById('art-f-desc').value.trim();
    artState.items[idx].date  = document.getElementById('art-f-date').value.trim();
    artState.items[idx].url   = document.getElementById('art-f-url').value.trim();
    document.getElementById('art-editor-heading').textContent = title;
    artPersist();
    renderArtList();
    artToast('Saved ✓');
  }

  function deleteArtItem() {
    if (!artState.activeId) return;
    var item = artState.items.find(function (x) { return x.id === artState.activeId; });
    if (!confirm('Delete "' + (item && item.title ? item.title : 'this article') + '"?')) return;
    artState.items = artState.items.filter(function (x) { return x.id !== artState.activeId; });
    artState.activeId = null;
    artPersist();
    renderArtList();
    document.getElementById('art-editor').style.display      = 'none';
    document.getElementById('art-empty-state').style.display = 'flex';
    artToast('Deleted');
  }

  function newArtItem() {
    var id = artUid();
    artState.items.push({ id: id, title: '', desc: '', date: '', url: '', coverId: null });
    artPersist();
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

  function artInit() {
    try {
      var stored = localStorage.getItem(ART_KEY);
      if (stored) artState.items = JSON.parse(stored);
    } catch (e) { artState.items = []; }
    bindArtEvents();
    renderArtList();
  }

  artInit();

})();
