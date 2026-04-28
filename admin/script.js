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

  var state = {
    projects:  {},
    activeId:  null,
    isNew:     false,
    gallery:   [],   // [{ imageId, alt, layout:'full'|'half' }]
    coverId:   null  // imageId of cover
  };

  // ── Init ────────────────────────────────────
  function init() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { state.projects = JSON.parse(stored); }
      catch (e) { state.projects = deepClone(PROJECTS); }
    } else {
      state.projects = deepClone(PROJECTS);
    }
    renderList();
    var keys = Object.keys(state.projects);
    if (keys.length) selectProject(keys[0]);
    bindGlobalEvents();
  }

  // ── Helpers ─────────────────────────────────
  function deepClone(o)   { return JSON.parse(JSON.stringify(o)); }
  function persist()      { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects)); }
  function slugify(s)     { return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }
  function uid()          { return 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
  function esc(s)         {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  // ── Project list ─────────────────────────────
  function renderList() {
    var list = document.getElementById('project-list');
    list.innerHTML = '';
    Object.keys(state.projects).forEach(function (id) {
      var p  = state.projects[id];
      var li = document.createElement('li');
      li.className     = 'project-list-item' + (id === state.activeId ? ' active' : '');
      li.dataset.id    = id;
      li.innerHTML     =
        '<p class="pli-title">' + esc(p.title || 'Untitled') + '</p>' +
        '<p class="pli-meta">' + esc(p.industry || '') + (p.year ? ' · ' + esc(p.year) : '') + '</p>';
      li.addEventListener('click', function () { selectProject(id); });
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
    document.getElementById('slug-preview').textContent = id;

    // Migrate old gallery format (src-based) to new imageId-based
    state.gallery = (p.gallery || []).map(function (item) {
      if (item.type === 'full')  return { imageId: item.imageId || null, src: item.src || null, alt: item.alt || '', layout: 'full' };
      if (item.type === 'pair')  return [
        { imageId: (item.images[0] || {}).imageId || null, src: (item.images[0] || {}).src || null, alt: (item.images[0] || {}).alt || '', layout: 'half' },
        { imageId: (item.images[1] || {}).imageId || null, src: (item.images[1] || {}).src || null, alt: (item.images[1] || {}).alt || '', layout: 'half' }
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
      var card = document.createElement('div');
      card.className    = 'gcard' + (item.imageId && item.imageId === state.coverId ? ' is-cover' : '');
      card.dataset.idx  = idx;

      card.innerHTML =
        '<div class="gcard-img-wrap">' +
          '<img class="gcard-img" src="" alt="" />' +
          '<div class="gcard-overlay">' +
            '<button class="gcard-cover-btn" title="Set as cover">★</button>' +
            '<button class="gcard-remove-btn" title="Remove">✕</button>' +
          '</div>' +
          '<span class="gcard-cover-badge">Cover</span>' +
        '</div>' +
        '<div class="gcard-meta">' +
          '<input class="field-input gcard-alt" type="text" placeholder="Alt text" value="' + esc(item.alt) + '" />' +
          '<div class="gcard-layout">' +
            '<button class="gcard-layout-btn' + (item.layout !== 'half' ? ' active' : '') + '" data-layout="full">Full</button>' +
            '<button class="gcard-layout-btn' + (item.layout === 'half' ? ' active' : '') + '" data-layout="half">Half</button>' +
          '</div>' +
        '</div>';

      // Load image
      var img = card.querySelector('.gcard-img');
      if (item.imageId) {
        ImageDB.get(item.imageId).then(function (rec) {
          if (rec) img.src = rec.dataUrl;
        });
      } else if (item.src) {
        img.src = item.src;
      }

      // Cover button
      card.querySelector('.gcard-cover-btn').addEventListener('click', function () {
        state.coverId = item.imageId || null;
        document.querySelectorAll('.gcard').forEach(function (c) {
          var cIdx = parseInt(c.dataset.idx);
          var cItem = state.gallery[cIdx];
          c.classList.toggle('is-cover', cItem && cItem.imageId === state.coverId);
        });
        toast('Cover image set');
      });

      // Remove button
      card.querySelector('.gcard-remove-btn').addEventListener('click', function () {
        if (item.imageId && item.imageId === state.coverId) state.coverId = null;
        state.gallery.splice(idx, 1);
        renderGalleryGrid();
      });

      // Alt text
      card.querySelector('.gcard-alt').addEventListener('input', function () {
        state.gallery[idx].alt = this.value;
      });

      // Layout toggle
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
      if (!file.type.startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = e.target.result;
        var id      = uid();
        ImageDB.save(id, dataUrl, file.name).then(function () {
          state.gallery.push({ imageId: id, src: null, alt: file.name.replace(/\.[^.]+$/, ''), layout: 'full' });
          // Auto-set first image as cover
          if (!state.coverId) state.coverId = id;
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
          { imageId: item.imageId, src: item.src, alt: item.alt },
          { imageId: state.gallery[i + 1].imageId, src: state.gallery[i + 1].src, alt: state.gallery[i + 1].alt }
        ]});
        i += 2;
      } else {
        result.push({ type: 'full', imageId: item.imageId, src: item.src, alt: item.alt });
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
    if (newSlug !== oldId && !state.isNew) delete state.projects[oldId];
    state.projects[newSlug] = data;
    state.activeId = newSlug;
    state.isNew    = false;
    persist();
    renderList();
    selectProject(newSlug);
    toast('Project saved ✓');
  }

  // ── Delete project ────────────────────────────
  function deleteProject() {
    if (!state.activeId) return;
    if (!confirm('Delete "' + (state.projects[state.activeId].title || state.activeId) + '"?')) return;
    delete state.projects[state.activeId];
    state.activeId = null;
    persist();
    renderList();
    document.getElementById('editor').style.display      = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    var keys = Object.keys(state.projects);
    if (keys.length) selectProject(keys[0]);
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
    persist();
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

    // Resolve all imageIds to base64 dataUrls for the export
    var exported = deepClone(state.projects);
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
    // Upload zone
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

    // Slug preview
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
