(function () {

  // ── Auth ────────────────────────────────────
  var PWD_KEY  = 'admin_pwd_hash';
  var AUTH_KEY = 'admin_authed';

  async function sha256(str) {
    var buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  }

  function showLock() {
    var hasPassword = !!localStorage.getItem(PWD_KEY);
    document.getElementById('lock-title').textContent = hasPassword ? 'Welcome back' : 'Set a password';
    document.getElementById('lock-sub').textContent   = hasPassword
      ? 'Enter your password to continue'
      : 'This is your first time — choose a password for the admin.';
    document.getElementById('lock-btn').textContent   = hasPassword ? 'Continue' : 'Set password';
  }

  document.getElementById('lock-form').addEventListener('submit', async function(e) {
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
      // First-time setup — save the hash and unlock
      localStorage.setItem(PWD_KEY, hash);
      sessionStorage.setItem(AUTH_KEY, '1');
      document.getElementById('lock-screen').classList.add('hidden');
    } else if (hash === storedHash) {
      sessionStorage.setItem(AUTH_KEY, '1');
      document.getElementById('lock-screen').classList.add('hidden');
    } else {
      errEl.textContent = 'Incorrect password';
      input.classList.add('shake');
      input.addEventListener('animationend', function(){ input.classList.remove('shake'); }, { once: true });
      input.value = '';
      input.focus();
    }

    btn.disabled = false;
  });

  // Toggle password visibility
  document.getElementById('lock-toggle').addEventListener('click', function () {
    var input  = document.getElementById('lock-input');
    var eyeOn  = document.getElementById('icon-eye');
    var eyeOff = document.getElementById('icon-eye-off');
    var showing = input.type === 'text';
    input.type       = showing ? 'password' : 'text';
    eyeOn.style.display  = showing ? '' : 'none';
    eyeOff.style.display = showing ? 'none' : '';
    input.focus();
  });

  // Already authenticated this session?
  if (sessionStorage.getItem(AUTH_KEY)) {
    document.getElementById('lock-screen').classList.add('hidden');
  } else {
    showLock();
  }

  // ── Projects ────────────────────────────────
  var STORAGE_KEY = 'portfolio_projects';

  // ── State ──────────────────────────────────
  var state = {
    projects: {},
    activeId: null,
    isNew: false
  };

  // ── Init ───────────────────────────────────
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

  // ── Helpers ────────────────────────────────
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function slugify(str) {
    return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  // ── Project list ───────────────────────────
  function renderList() {
    var list = document.getElementById('project-list');
    list.innerHTML = '';
    Object.keys(state.projects).forEach(function (id) {
      var p = state.projects[id];
      var li = document.createElement('li');
      li.className = 'project-list-item' + (id === state.activeId ? ' active' : '');
      li.dataset.id = id;
      li.innerHTML =
        '<p class="pli-title">' + esc(p.title || 'Untitled') + '</p>' +
        '<p class="pli-meta">' + esc(p.industry || '') + (p.year ? ' · ' + esc(p.year) : '') + '</p>';
      li.addEventListener('click', function () { selectProject(id); });
      list.appendChild(li);
    });
  }

  // ── Select project ─────────────────────────
  function selectProject(id) {
    state.activeId = id;
    state.isNew = false;
    document.querySelectorAll('.project-list-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.id === id);
    });
    populateEditor(id);
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('editor').style.display = 'block';
  }

  // ── Populate editor ────────────────────────
  function populateEditor(id) {
    var p = state.projects[id];
    document.getElementById('editor-heading').textContent = p.title || 'Untitled';
    document.getElementById('editor-url').textContent = '/pages/work/project/?id=' + id;
    document.getElementById('btn-preview').href = '/pages/work/project/?id=' + id;

    document.getElementById('f-slug').value     = id;
    document.getElementById('f-title').value    = p.title    || '';
    document.getElementById('f-tagline').value  = p.tagline  || '';
    document.getElementById('f-about').value    = p.about    || '';
    document.getElementById('f-industry').value = p.industry || '';
    document.getElementById('f-role').value     = p.role     || '';
    document.getElementById('f-year').value     = p.year     || '';
    document.getElementById('f-meta').value     = p.meta     || '';
    document.getElementById('f-card-img').value = p.cardImg  || '';
    document.getElementById('slug-preview').textContent = id;

    renderGallery(p.gallery || []);
  }

  // ── Gallery render ─────────────────────────
  function renderGallery(gallery) {
    var list = document.getElementById('gallery-list');
    var empty = document.getElementById('empty-gallery');
    list.innerHTML = '';

    if (!gallery.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    gallery.forEach(function (section, idx) {
      var item = document.createElement('div');
      item.className = 'gallery-item';
      item.dataset.index = idx;

      if (section.type === 'full') {
        item.innerHTML =
          '<div class="gallery-item-header">' +
            '<span class="gallery-item-type type-full">Full width</span>' +
            '<button class="btn-icon" data-remove="' + idx + '" title="Remove">✕</button>' +
          '</div>' +
          '<div class="gallery-item-fields">' +
            '<div class="gallery-img-row">' +
              '<div class="field">' +
                '<label class="field-label">Image path</label>' +
                '<input class="field-input" data-gi="' + idx + '" data-key="src" type="text" value="' + esc(section.src || '') + '" placeholder="/image/filename.jpg" />' +
              '</div>' +
              '<div class="field">' +
                '<label class="field-label">Alt text</label>' +
                '<input class="field-input" data-gi="' + idx + '" data-key="alt" type="text" value="' + esc(section.alt || '') + '" placeholder="Description" />' +
              '</div>' +
            '</div>' +
          '</div>';

      } else if (section.type === 'pair') {
        var img0 = section.images[0] || {};
        var img1 = section.images[1] || {};
        item.innerHTML =
          '<div class="gallery-item-header">' +
            '<span class="gallery-item-type type-pair">Side-by-side pair</span>' +
            '<button class="btn-icon" data-remove="' + idx + '" title="Remove">✕</button>' +
          '</div>' +
          '<div class="gallery-pair-row">' +
            '<div class="gallery-pair-col">' +
              '<label class="field-label">Image 1</label>' +
              '<div class="gallery-pair-inner">' +
                '<input class="field-input" data-gi="' + idx + '" data-pair="0" data-key="src" type="text" value="' + esc(img0.src || '') + '" placeholder="/image/filename.jpg" />' +
                '<input class="field-input" data-gi="' + idx + '" data-pair="0" data-key="alt" type="text" value="' + esc(img0.alt || '') + '" placeholder="Alt text" />' +
              '</div>' +
            '</div>' +
            '<div class="gallery-pair-col">' +
              '<label class="field-label">Image 2</label>' +
              '<div class="gallery-pair-inner">' +
                '<input class="field-input" data-gi="' + idx + '" data-pair="1" data-key="src" type="text" value="' + esc(img1.src || '') + '" placeholder="/image/filename.jpg" />' +
                '<input class="field-input" data-gi="' + idx + '" data-pair="1" data-key="alt" type="text" value="' + esc(img1.alt || '') + '" placeholder="Alt text" />' +
              '</div>' +
            '</div>' +
          '</div>';
      }

      list.appendChild(item);
    });

    // Remove buttons
    list.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.dataset.remove);
        var gallery = getCurrentGalleryFromDOM();
        gallery.splice(idx, 1);
        state.projects[state.activeId].gallery = gallery;
        persist();
        renderGallery(gallery);
        toast('Gallery item removed');
      });
    });
  }

  // ── Read gallery from DOM ──────────────────
  function getCurrentGalleryFromDOM() {
    var gallery = deepClone(state.projects[state.activeId].gallery || []);
    // Sync any in-progress edits
    document.querySelectorAll('[data-gi]').forEach(function (input) {
      var idx  = parseInt(input.dataset.gi);
      var key  = input.dataset.key;
      var pair = input.dataset.pair;
      var section = gallery[idx];
      if (!section) return;
      if (pair !== undefined) {
        section.images[parseInt(pair)][key] = input.value;
      } else {
        section[key] = input.value;
      }
    });
    return gallery;
  }

  // ── Read full form ─────────────────────────
  function readForm() {
    return {
      title:    document.getElementById('f-title').value.trim(),
      tagline:  document.getElementById('f-tagline').value.trim(),
      about:    document.getElementById('f-about').value.trim(),
      industry: document.getElementById('f-industry').value.trim(),
      role:     document.getElementById('f-role').value.trim(),
      year:     document.getElementById('f-year').value.trim(),
      meta:     document.getElementById('f-meta').value.trim(),
      cardImg:  document.getElementById('f-card-img').value.trim(),
      gallery:  getCurrentGalleryFromDOM()
    };
  }

  // ── Save project ───────────────────────────
  function saveProject() {
    var newSlug = slugify(document.getElementById('f-slug').value.trim());
    if (!newSlug) { toast('Slug is required'); return; }

    var data = readForm();
    if (!data.title) { toast('Title is required'); return; }

    var oldId = state.activeId;

    // Handle slug rename
    if (newSlug !== oldId && !state.isNew) {
      delete state.projects[oldId];
    }

    state.projects[newSlug] = data;
    state.activeId = newSlug;
    state.isNew = false;

    persist();
    renderList();
    selectProject(newSlug);
    toast('Project saved ✓');
  }

  // ── Delete project ─────────────────────────
  function deleteProject() {
    if (!state.activeId) return;
    if (!confirm('Delete "' + state.projects[state.activeId].title + '"? This cannot be undone.')) return;

    delete state.projects[state.activeId];
    state.activeId = null;
    persist();
    renderList();

    document.getElementById('editor').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';

    var keys = Object.keys(state.projects);
    if (keys.length) selectProject(keys[0]);

    toast('Project deleted');
  }

  // ── New project ────────────────────────────
  function newProject() {
    state.isNew = true;
    var tempId = 'new-project-' + Date.now();
    state.projects[tempId] = {
      title: '', tagline: '', about: '',
      industry: '', role: '', year: '',
      meta: '', cardImg: '', gallery: []
    };
    persist();
    renderList();
    selectProject(tempId);

    document.getElementById('f-slug').value = '';
    document.getElementById('f-slug').focus();
    document.getElementById('editor-heading').textContent = 'New Project';
    toast('New project created — fill in the details and save');
  }

  // ── Add gallery item ───────────────────────
  function addGalleryItem(type) {
    if (!state.activeId) return;
    var p = state.projects[state.activeId];
    p.gallery = getCurrentGalleryFromDOM();

    if (type === 'full') {
      p.gallery.push({ type: 'full', src: '', alt: '' });
    } else {
      p.gallery.push({ type: 'pair', images: [{ src: '', alt: '' }, { src: '', alt: '' }] });
    }

    renderGallery(p.gallery);
  }

  // ── Export projects.js ─────────────────────
  function exportProjects() {
    // Sync current form before export
    if (state.activeId) {
      state.projects[state.activeId] = Object.assign(
        state.projects[state.activeId], readForm()
      );
    }

    var lines = ['var PROJECTS = {', ''];
    var keys = Object.keys(state.projects);
    keys.forEach(function (id, i) {
      var p = state.projects[id];
      lines.push("  '" + id + "': " + JSON.stringify(p, null, 4)
        .split('\n').map(function (l, li) { return li === 0 ? l : '  ' + l; }).join('\n') +
        (i < keys.length - 1 ? ',' : ''));
      lines.push('');
    });
    lines.push('};');

    var content = lines.join('\n');
    var blob = new Blob([content], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'projects.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Exported projects.js — replace /data/projects.js with this file');
  }

  // ── Slug live preview ──────────────────────
  function bindGlobalEvents() {
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
    document.getElementById('btn-add-full').addEventListener('click', function () { addGalleryItem('full'); });
    document.getElementById('btn-add-pair').addEventListener('click', function () { addGalleryItem('pair'); });

    // Keyboard shortcut: Cmd/Ctrl+S to save
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveProject();
      }
    });
  }

  // ── Escape HTML ────────────────────────────
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Start ──────────────────────────────────
  init();

})();
