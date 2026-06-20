/**
 * app.js – Main application controller.
 * Wires together Auth, Storage, Editor, AI, Voice, OCR, Notes, Search.
 */
const App = (() => {
  /* ---- state ---- */
  let currentView      = 'dashboard';
  let currentCategory  = null;
  let editingId        = null;
  let deletingId       = null;
  let viewingId        = null;
  let autoSaveTimer    = null;
  let interimSpan      = null;   // live interim voice text element

  /* ---- Bootstrap instances ---- */
  let bsNoteModal, bsDeleteModal, bsViewModal, bsOcrModal, bsSettingsModal, bsAiModal, bsToast;
  let _appShown = false;

  /* ===========================================================
     BOOT
  =========================================================== */
  async function boot() {
    /* Init Bootstrap instances */
    bsNoteModal     = new bootstrap.Modal('#noteModal');
    bsDeleteModal   = new bootstrap.Modal('#deleteModal');
    bsViewModal     = new bootstrap.Modal('#viewNoteModal');
    bsOcrModal      = new bootstrap.Modal('#ocrModal');
    bsSettingsModal = new bootstrap.Modal('#settingsModal');
    bsAiModal       = new bootstrap.Modal('#aiModal');
    bsToast         = new bootstrap.Toast('#appToast', { delay: 3000 });

    /* Bind auth screen events immediately so login/register buttons work */
    _bindAuthEvents();

    /* Auth flow — guard against onAuthStateChange firing multiple times */
    Auth.init(
      async user => {
        if (_appShown) { _updateUserUI(user); return; }
        _appShown = true;
        _applyTheme(Storage.getSettings().theme || 'light', false);
        _showApp(user);
        await _initialLoad();
      },
      () => {
        _appShown = false;
        Storage.invalidateCache();
        _showAuth();
      }
    );
  }

  /* ===========================================================
     AUTH SCREEN LOGIC
  =========================================================== */
  function _showAuth() {
    document.getElementById('authScreen').classList.remove('d-none');
    document.getElementById('appScreen').classList.add('d-none');
  }

  function _showApp(user) {
    document.getElementById('authScreen').classList.add('d-none');
    document.getElementById('appScreen').classList.remove('d-none');
    _updateUserUI(user);
  }

  function _updateUserUI(user) {
    const nameEl   = document.getElementById('topbarUserName');
    const avatarEl = document.getElementById('topbarAvatar');
    if (!user) return;
    if (nameEl)   nameEl.textContent = user.displayName || user.email || 'User';
    if (avatarEl) {
      if (user.photoURL) {
        avatarEl.innerHTML = `<img src="${user.photoURL}" alt="avatar" class="user-avatar-img">`;
      } else {
        const initials = (user.displayName || user.email || 'U')[0].toUpperCase();
        avatarEl.textContent = initials;
      }
    }
  }

  async function _initialLoad() {
    /* Sync settings & draft from Supabase before rendering */
    await Promise.all([
      Storage.loadSettingsFromDb(),
      Storage.loadDraftFromDb(),
    ]);

    /* Apply synced theme */
    _applyTheme(Storage.getSettings().theme || 'light', false);

    /* Init Quill editor */
    Editor.init('quillEditor');

    /* Init Voice */
    Voice.init(listening => _updateVoiceBtn(listening));

    /* Bind app events */
    _bindAppEvents();

    /* Load notes and render */
    await Storage.getNotes();
    renderAll();
    showView('dashboard');
  }

  /* ===========================================================
     AUTH EVENT BINDING
  =========================================================== */
  function _bindAuthEvents() {
    /* Toggle login/register panes */
    document.getElementById('goToRegisterBtn')?.addEventListener('click', e => { e.preventDefault(); _switchPane('register'); });
    document.getElementById('goToLoginBtn')?.addEventListener('click',    e => { e.preventDefault(); _switchPane('login'); });

    /* Login */
    document.getElementById('loginBtn')?.addEventListener('click', async () => {
      const email = document.getElementById('loginEmail').value.trim();
      const pw    = document.getElementById('loginPassword').value;
      const errEl = document.getElementById('loginError');
      errEl.classList.add('d-none');
      try {
        _setLoading('loginBtn', true);
        await Auth.login(email, pw);
      } catch (e) {
        errEl.textContent = e.message; errEl.classList.remove('d-none');
      } finally { _setLoading('loginBtn', false); }
    });

    /* Register */
    document.getElementById('registerBtn')?.addEventListener('click', async () => {
      const name  = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const pw    = document.getElementById('regPassword').value;
      const conf  = document.getElementById('regConfirm').value;
      const errEl = document.getElementById('registerError');
      errEl.classList.add('d-none');
      if (pw !== conf) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('d-none'); return; }
      try {
        _setLoading('registerBtn', true);
        const result = await Auth.register(email, pw, name);
        if (result.needsConfirmation) {
          errEl.className = 'alert alert-success';
          errEl.textContent = 'Account created! Please check your email to confirm your account, then sign in.';
          errEl.classList.remove('d-none');
        }
      } catch (e) {
        errEl.className = 'alert alert-danger';
        errEl.textContent = e.message; errEl.classList.remove('d-none');
      } finally { _setLoading('registerBtn', false); }
    });

    /* Forgot password */
    document.getElementById('forgotPwdLink')?.addEventListener('click', async e => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      if (!email) { showToast('Enter your email first.', 'danger'); return; }
      try { await Auth.sendPasswordReset(email); showToast('Reset email sent!', 'success'); }
      catch (e) { showToast(e.message, 'danger'); }
    });

    /* Password visibility toggles */
    ['loginPwToggle','regPwToggle'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        const inputId = id === 'loginPwToggle' ? 'loginPassword' : 'regPassword';
        const inp = document.getElementById(inputId);
        const icon = document.querySelector(`#${id} i`);
        if (inp.type === 'password') { inp.type = 'text'; icon.className = 'fas fa-eye-slash'; }
        else                         { inp.type = 'password'; icon.className = 'fas fa-eye'; }
      });
    });
  }

  function _switchPane(to) {
    document.getElementById('loginPane').classList.toggle('d-none',    to !== 'login');
    document.getElementById('registerPane').classList.toggle('d-none', to !== 'register');
  }

  function _setLoading(btnId, on) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = on;
    if (on) btn.dataset.origHtml = btn.innerHTML;
    btn.innerHTML = on ? '<span class="spinner-border spinner-border-sm me-2"></span>Please wait…' : btn.dataset.origHtml;
  }

  /* ===========================================================
     APP EVENT BINDING
  =========================================================== */
  function _bindAppEvents() {
    /* Sidebar nav */
    document.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', () => { _setActiveNav(el.dataset.view); showView(el.dataset.view); });
    });

    /* Mobile sidebar */
    document.getElementById('hamburgerBtn')?.addEventListener('click', _openSidebar);
    document.getElementById('sidebarCloseBtn')?.addEventListener('click', _closeSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', _closeSidebar);

    /* Topbar: create note */
    document.getElementById('createNoteBtn')?.addEventListener('click', openCreate);

    /* Topbar: settings */
    document.getElementById('settingsBtn')?.addEventListener('click', () => { _populateSettings(); bsSettingsModal.show(); });

    /* Topbar: logout */
    document.getElementById('logoutBtn')?.addEventListener('click', async () => { await Auth.logout(); });

    /* Dashboard: view all */
    document.getElementById('viewAllBtn')?.addEventListener('click', () => { _setActiveNav('all-notes'); showView('all-notes'); });

    /* Search */
    const searchEl = document.getElementById('globalSearch');
    const clearBtn = document.getElementById('clearSearchBtn');
    searchEl?.addEventListener('input', () => {
      const q = searchEl.value;
      clearBtn?.classList.toggle('d-none', !q);
      _handleSearch(q);
    });
    clearBtn?.addEventListener('click', () => {
      searchEl.value = ''; clearBtn.classList.add('d-none');
      showView(currentView === 'search' ? 'all-notes' : currentView);
    });

    /* Filters */
    document.getElementById('categoryFilter')?.addEventListener('change', _applyFilters);
    document.getElementById('colorFilter')?.addEventListener('change',    _applyFilters);
    document.getElementById('sortFilter')?.addEventListener('change',     _applyFilters);

    /* Grid / List */
    document.getElementById('gridViewBtn')?.addEventListener('click', () => {
      document.getElementById('gridViewBtn').classList.add('active');
      document.getElementById('listViewBtn').classList.remove('active');
      document.getElementById('allNotesList').classList.remove('list-view');
    });
    document.getElementById('listViewBtn')?.addEventListener('click', () => {
      document.getElementById('listViewBtn').classList.add('active');
      document.getElementById('gridViewBtn').classList.remove('active');
      document.getElementById('allNotesList').classList.add('list-view');
    });

    /* Theme toggle */
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      _applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    /* Note modal: colour picker */
    document.getElementById('colorPicker')?.addEventListener('click', e => {
      const dot = e.target.closest('.color-dot');
      if (!dot) return;
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      document.getElementById('noteColor').value = dot.dataset.color;
    });

    /* Note modal: save */
    document.getElementById('saveNoteBtn')?.addEventListener('click', saveNote);

    /* Note modal: voice */
    document.getElementById('voiceBtn')?.addEventListener('click', _toggleVoice);

    /* Note modal: AI dropdown actions */
    document.getElementById('aiSummarizeBtn')?.addEventListener('click',  () => _runAI('summarize'));
    document.getElementById('aiGenerateBtn')?.addEventListener('click',   () => _runAI('generate'));
    document.getElementById('aiGrammarBtn')?.addEventListener('click',    () => _runAI('grammar'));
    document.getElementById('aiExpandBtn')?.addEventListener('click',     () => _runAI('expand'));

    /* OCR trigger button (in note modal toolbar) */
    document.getElementById('ocrBtn')?.addEventListener('click', () => {
      bsOcrModal.show();
      document.getElementById('ocrPreview').src = '';
      document.getElementById('ocrPreviewWrap').classList.add('d-none');
      document.getElementById('ocrResult').value = '';
      document.getElementById('ocrProgress').style.width = '0%';
      document.getElementById('ocrProgressWrap').classList.add('d-none');
      document.getElementById('ocrInsertBtn').classList.add('d-none');
    });

    /* OCR: image picker */
    document.getElementById('ocrFileInput')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      document.getElementById('ocrPreview').src = url;
      document.getElementById('ocrPreviewWrap').classList.remove('d-none');
      document.getElementById('ocrProgressWrap').classList.remove('d-none');
      document.getElementById('ocrResult').value = 'Extracting text…';
      try {
        const text = await OCR.recogniseFile(file, pct => {
          document.getElementById('ocrProgress').style.width = pct + '%';
          document.getElementById('ocrProgressLabel').textContent = pct + '%';
        });
        document.getElementById('ocrResult').value = text;
        document.getElementById('ocrInsertBtn').classList.remove('d-none');
        showToast('Text extracted!', 'success');
      } catch (err) {
        document.getElementById('ocrResult').value = 'Error: ' + err.message;
        showToast(err.message, 'danger');
      }
      URL.revokeObjectURL(url);
    });

    document.getElementById('ocrInsertBtn')?.addEventListener('click', () => {
      const text = document.getElementById('ocrResult').value;
      if (text) { Editor.insertText(text); bsOcrModal.hide(); showToast('Text inserted into note!', 'success'); }
    });

    /* Delete modal: confirm */
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', _confirmDelete);

    /* View modal: edit / export */
    document.getElementById('editFromViewBtn')?.addEventListener('click', () => { bsViewModal.hide(); openEdit(viewingId); });
    document.getElementById('exportTxtBtn')?.addEventListener('click',   () => { const n = Storage.getNoteById(viewingId); if (n) Notes.exportTxt(n); });
    document.getElementById('exportHtmlBtn')?.addEventListener('click',  () => { const n = Storage.getNoteById(viewingId); if (n) Notes.exportHtml(n); });

    /* Settings modal: export all / clear all */
    document.getElementById('saveApiKeyBtn')?.addEventListener('click', _saveApiKey);
    document.getElementById('exportAllBtn')?.addEventListener('click', () => Storage.exportAllPdf());
    document.getElementById('clearAllBtn')?.addEventListener('click',  async () => {
      if (!confirm('Delete ALL notes? This cannot be undone.')) return;
      const notes = await Storage.getNotes();
      for (const n of notes) await Storage.deleteNote(n.id);
      renderAll(); showView('dashboard');
      bsSettingsModal.hide(); showToast('All notes deleted.', 'danger');
    });

    /* Note modal: auto-save on text change is handled by Quill text-change event (Editor.init) */
    document.getElementById('noteTitle')?.addEventListener('input', _scheduleAutoSave);

    /* Note modal: clear draft on close */
    document.getElementById('noteModal')?.addEventListener('hidden.bs.modal', () => {
      if (!editingId) Storage.clearDraft();
      Voice.stop();
      _updateVoiceBtn(false);
      _resetForm();
    });

    /* Delegated note actions */
    document.addEventListener('click', e => {
      const btn = e.target.closest('.action-btn');
      if (!btn) return;
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.classList.contains('btn-edit'))   openEdit(id);
      else if (btn.classList.contains('btn-del'))    _openDelete(id);
      else if (btn.classList.contains('btn-pin'))    _togglePin(id);
      else if (btn.classList.contains('btn-fav'))    _toggleFav(id);
      else if (btn.classList.contains('btn-export')) { const n = Storage.getNoteById(id); if (n) Notes.exportTxt(n); }
    });
  }

  /* ===========================================================
     SIDEBAR
  =========================================================== */
  function _openSidebar()  { document.getElementById('sidebar')?.classList.add('open'); document.getElementById('sidebarOverlay')?.classList.add('show'); }
  function _closeSidebar() { document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebarOverlay')?.classList.remove('show'); }

  /* ===========================================================
     VIEW MANAGEMENT
  =========================================================== */
  function showView(name) {
    currentView = name;
    const TITLES = {
      dashboard: 'Dashboard', 'all-notes': 'All Notes',
      favorites: 'Favourites', pinned: 'Pinned Notes',
      category: `Category: ${currentCategory || ''}`, search: 'Search Results',
    };
    document.getElementById('pageTitle').textContent = TITLES[name] || 'Notes';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const MAP = {
      dashboard: 'dashboardView', 'all-notes': 'allNotesView',
      favorites: 'favoritesView', pinned: 'pinnedView',
      category: 'categoryView',   search: 'searchView',
    };
    document.getElementById(MAP[name])?.classList.add('active');
    _closeSidebar();

    switch (name) {
      case 'dashboard':  _renderDashboard(); break;
      case 'all-notes':  _applyFilters();    break;
      case 'favorites':  _renderFavorites(); break;
      case 'pinned':     _renderPinned();    break;
      case 'category':   _renderCategory(); break;
    }
  }

  function _setActiveNav(name) {
    document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === name));
    document.querySelectorAll('.cat-nav-item').forEach(el => el.classList.remove('active'));
  }

  /* ===========================================================
     RENDER
  =========================================================== */
  function renderAll() {
    _renderStats();
    _renderCategoryNav();
    _refreshCategoryFilter();
  }

  function _renderDashboard() {
    _renderStats();
    _renderToContainer('recentNotesList',    Notes.pinFirst(Storage.getCached() || []).slice(0, 6));
    _renderCatOverview();
  }

  function _renderStats() {
    const ns = Storage.getCached();
    const cats = new Set(ns.map(n => n.category));
    _setText('totalNotes',      ns.length);
    _setText('totalCategories', cats.size);
    _setText('totalFavorites',  ns.filter(n => n.favorite).length);
    _setText('totalPinned',     ns.filter(n => n.pinned).length);
  }

  function _renderCatOverview() {
    const container = document.getElementById('categoriesOverview');
    if (!container) return;
    container.innerHTML = '';
    const counts = _catCounts();
    if (!Object.keys(counts).length) { _showEmpty(container, 'No Categories', 'Create notes to see categories.'); return; }
    Object.entries(counts).forEach(([cat, cnt]) => container.appendChild(Notes.createCatCard(cat, cnt)));
  }

  function _applyFilters() {
    let ns = Storage.getCached();
    ns = Search.filterByCategory(document.getElementById('categoryFilter')?.value, ns);
    ns = Search.filterByColor(document.getElementById('colorFilter')?.value, ns);
    ns = Search.sortNotes(document.getElementById('sortFilter')?.value || 'newest', ns);
    ns = Notes.pinFirst(ns);
    _renderToContainer('allNotesList', ns, null, 'No Notes Found', 'Try different filters.');
  }

  function _renderFavorites() { _renderToContainer('favoriteNotesList', Notes.pinFirst(Storage.getCached().filter(n=>n.favorite)), null, 'No Favourites', 'Star a note to see it here.'); }
  function _renderPinned()    { _renderToContainer('pinnedNotesList',   Storage.getCached().filter(n=>n.pinned), null, 'No Pinned Notes', 'Pin a note to keep it at the top.'); }
  function _renderCategory()  { _renderToContainer('categoryNotesList', Notes.pinFirst(Storage.getCached().filter(n=>n.category===currentCategory)), null, `No notes in "${currentCategory}"`, ''); }

  function _renderToContainer(containerId, notes, query, emptyTitle = 'No Notes', emptyMsg = '') {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.innerHTML = '';
    if (!notes || !notes.length) { _showEmpty(c, emptyTitle, emptyMsg); return; }
    notes.forEach(n => c.appendChild(Notes.createCard(n, query)));
  }

  function _showEmpty(container, title, msg) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-sticky-note empty-icon"></i><h5>${title}</h5><p>${msg}</p></div>`;
  }

  function _renderCategoryNav() {
    const list = document.getElementById('categoryNavList');
    if (!list) return;
    list.innerHTML = '';
    Object.entries(_catCounts()).forEach(([cat, cnt]) => {
      const { icon } = Notes.getCatMeta(cat);
      const li = document.createElement('li');
      li.className = 'cat-nav-item';
      li.dataset.cat = cat;
      li.innerHTML = `<i class="fas ${icon}" style="width:18px;text-align:center"></i><span>${Search.escHtml(cat)}</span><span class="cat-badge">${cnt}</span>`;
      li.addEventListener('click', () => showCategory(cat));
      list.appendChild(li);
    });
  }

  function _refreshCategoryFilter() {
    const sel = document.getElementById('categoryFilter');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>';
    Storage.getCategories().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat; opt.textContent = cat;
      if (cat === cur) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function _catCounts() {
    const counts = {};
    Storage.getCached().forEach(n => { const c = n.category||'Uncategorised'; counts[c]=(counts[c]||0)+1; });
    return counts;
  }

  /* ===========================================================
     SEARCH
  =========================================================== */
  function _handleSearch(query) {
    if (!query.trim()) { showView(currentView === 'search' ? 'all-notes' : currentView); return; }
    currentView = 'search';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('searchView')?.classList.add('active');
    document.getElementById('pageTitle').textContent = 'Search Results';

    const notes = Notes.pinFirst(Search.searchNotes(query, Storage.getCached()));
    _setText('searchMeta', `${notes.length} result${notes.length!==1?'s':''} for "${query}"`);
    _renderToContainer('searchNotesList', notes, query, 'No Results', `Nothing matched "${query}".`);
  }

  /* ===========================================================
     CATEGORY
  =========================================================== */
  function showCategory(cat) {
    currentCategory = cat;
    _setActiveNav('');
    document.querySelectorAll('.cat-nav-item').forEach(el => el.classList.toggle('active', el.dataset.cat === cat));
    document.getElementById('pageTitle').textContent = `Category: ${cat}`;
    showView('category');
  }

  /* ===========================================================
     NOTE CRUD
  =========================================================== */
  function openCreate() {
    editingId = null;
    _resetForm();
    document.getElementById('noteModalLabel').innerHTML = '<i class="fas fa-plus-circle"></i> Create Note';
    document.getElementById('saveNoteBtn').innerHTML    = '<i class="fas fa-save"></i> Save Note';
    document.getElementById('noteDate').textContent     = Storage.formatDate(new Date());
    _loadDraft();
    bsNoteModal.show();
    setTimeout(() => document.getElementById('noteTitle')?.focus(), 350);
  }

  function openEdit(id) {
    const note = Storage.getNoteById(id);
    if (!note) return;
    editingId = id;
    _resetForm();
    document.getElementById('noteModalLabel').innerHTML = '<i class="fas fa-pencil"></i> Edit Note';
    document.getElementById('saveNoteBtn').innerHTML    = '<i class="fas fa-save"></i> Update Note';
    document.getElementById('noteId').value       = note.id;
    document.getElementById('noteTitle').value    = note.title    || '';
    document.getElementById('noteCategory').value = note.category || 'Personal';
    document.getElementById('noteColor').value    = note.color    || 'default';
    document.getElementById('notePinned').checked   = !!note.pinned;
    document.getElementById('noteFavorite').checked = !!note.favorite;
    document.getElementById('noteDate').textContent = note.date   || '';
    Editor.setHTML(note.content || '');
    _setColorDot(note.color || 'default');
    bsNoteModal.show();
  }

  async function saveNote() {
    const titleEl = document.getElementById('noteTitle');
    const title   = titleEl.value.trim();
    const html    = Editor.getHTML();
    const text    = Editor.getText().trim();

    let valid = true;
    if (!title) { titleEl.classList.add('is-invalid'); valid = false; }
    else         { titleEl.classList.remove('is-invalid'); }
    if (!text)  { document.getElementById('quillEditorWrap').classList.add('border-danger'); valid = false; }
    else         { document.getElementById('quillEditorWrap').classList.remove('border-danger'); }
    if (!valid) return;

    const data = {
      title,
      category:    document.getElementById('noteCategory').value,
      content:     html,
      contentText: text,
      color:       document.getElementById('noteColor').value || 'default',
      pinned:      document.getElementById('notePinned').checked,
      favorite:    document.getElementById('noteFavorite').checked,
    };

    try {
      document.getElementById('saveNoteBtn').disabled = true;
      if (editingId) { await Storage.updateNote(editingId, data); showToast('Note updated!', 'success'); }
      else           { await Storage.addNote(data);                showToast('Note created!', 'success'); }
      Storage.clearDraft();
      bsNoteModal.hide();
      renderAll();
      showView(currentView === 'search' ? 'all-notes' : currentView);
    } catch (e) {
      showToast('Save failed: ' + e.message, 'danger');
    } finally {
      document.getElementById('saveNoteBtn').disabled = false;
    }
  }

  function _openDelete(id) { deletingId = id; bsDeleteModal.show(); }

  async function _confirmDelete() {
    if (!deletingId) return;
    await Storage.deleteNote(deletingId);
    deletingId = null;
    bsDeleteModal.hide();
    showToast('Note deleted.', 'danger');
    renderAll();
    showView(currentView === 'search' ? 'all-notes' : currentView);
  }

  function viewNote(id) {
    const note = Storage.getNoteById(id);
    if (!note) return;
    viewingId = id;
    document.getElementById('viewNoteTitle').textContent    = note.title    || 'Untitled';
    document.getElementById('viewNoteCategory').textContent = note.category || '';
    document.getElementById('viewNoteDate').textContent     = note.date     || '';
    document.getElementById('viewNoteContent').innerHTML    = note.content  || '';
    const plain = note.contentText || Storage.stripHtml(note.content || '');
    _setText('viewWordCount', Search.wordCount(plain));
    _setText('viewCharCount', Search.charCount(plain));

    /* Colour header */
    const header  = document.getElementById('viewModalHeader');
    const dark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const PALLETE = dark
      ? { yellow:'#3d3000', blue:'#0d1f3c', green:'#0a2e14', pink:'#2e0a1e', purple:'#1e0a3c' }
      : { yellow:'#fef9c3', blue:'#dbeafe', green:'#dcfce7', pink:'#fce7f3', purple:'#f3e8ff' };
    header.style.background = (note.color && note.color !== 'default') ? (PALLETE[note.color] || '') : '';

    bsViewModal.show();
  }

  /* ===========================================================
     QUICK ACTIONS (pin / fav)
  =========================================================== */
  async function _togglePin(id) {
    const n = Storage.getNoteById(id); if (!n) return;
    await Storage.updateNote(id, { pinned: !n.pinned });
    showToast(n.pinned ? 'Unpinned.' : 'Pinned!', 'info');
    _refresh();
  }

  async function _toggleFav(id) {
    const n = Storage.getNoteById(id); if (!n) return;
    await Storage.updateNote(id, { favorite: !n.favorite });
    showToast(n.favorite ? 'Removed from favourites.' : 'Added to favourites!', 'info');
    _refresh();
  }

  function _refresh() { renderAll(); showView(currentView); }

  /* ===========================================================
     VOICE INPUT
  =========================================================== */
  function _toggleVoice() {
    if (!Voice.isSupported()) { showToast('Voice input not supported in this browser.', 'danger'); return; }
    if (!Voice.isListening()) {
      /* Append a live-preview span to the editor */
      const div = document.createElement('p');
      div.id = 'voiceInterim';
      div.style.cssText = 'color:#64748b;font-style:italic';
      document.querySelector('#quillEditor .ql-editor')?.appendChild(div);
      interimSpan = div;

      Voice.start((final, interim) => {
        if (final)   { Editor.insertText(final + ' '); if (interimSpan) interimSpan.textContent = ''; }
        if (interim && interimSpan) interimSpan.textContent = interim;
        _scheduleAutoSave();
      });
    } else {
      Voice.stop();
      if (interimSpan) { interimSpan.remove(); interimSpan = null; }
    }
  }

  function _updateVoiceBtn(listening) {
    const btn = document.getElementById('voiceBtn');
    if (!btn) return;
    btn.classList.toggle('btn-danger',  listening);
    btn.classList.toggle('btn-outline-secondary', !listening);
    btn.innerHTML = listening
      ? '<i class="fas fa-stop"></i> Stop'
      : '<i class="fas fa-microphone"></i> Voice';
  }

  /* ===========================================================
     AI FEATURES
  =========================================================== */
  async function _runAI(action) {
    if (!AI.hasKey()) {
      showToast('Add your Gemini API key in ⚙ Settings → API Keys.', 'danger');
      return;
    }

    /* For "generate" we need a topic input */
    if (action === 'generate') {
      const topic = prompt('What topic should I generate a note about?');
      if (!topic) return;
      await _callAI(() => AI.generateNote(topic), text => {
        Editor.clear();
        Editor.insertText(text);
      });
      return;
    }

    const plainText = Editor.getText().trim();
    if (!plainText && action !== 'generate') {
      showToast('Write something first, then use AI tools.', 'danger');
      return;
    }

    /* Show AI modal with spinner */
    document.getElementById('aiResultText').value = '';
    document.getElementById('aiSpinner').classList.remove('d-none');
    document.getElementById('aiResult').classList.add('d-none');
    document.getElementById('aiModalTitle').textContent =
      action === 'summarize' ? 'AI Summary'
      : action === 'grammar' ? 'Grammar Fix'
      : 'AI Expansion';
    bsAiModal.show();

    await _callAI(
      () => action === 'summarize' ? AI.summarize(plainText)
           : action === 'grammar'  ? AI.fixGrammar(plainText)
           :                         AI.expandNote(plainText),
      text => {
        document.getElementById('aiSpinner').classList.add('d-none');
        document.getElementById('aiResult').classList.remove('d-none');
        document.getElementById('aiResultText').value = text;
      },
      action
    );
  }

  async function _callAI(fn, onSuccess, action) {
    try {
      const result = await fn();
      onSuccess(result);
      /* Log AI usage to Supabase */
      if (Auth.getUid() && action) {
        window.supabaseClient.from('ai_usage_log').insert({
          user_id: Auth.getUid(),
          note_id: editingId || null,
          action,
        }).then(() => {});
      }
    } catch (e) {
      document.getElementById('aiSpinner')?.classList.add('d-none');
      document.getElementById('aiResult')?.classList.remove('d-none');
      document.getElementById('aiResultText').value = 'Error: ' + e.message;
      showToast(e.message, 'danger');
    }
  }

  /* Called from AI modal "Insert into note" button */
  function insertAiResult() {
    const text = document.getElementById('aiResultText').value;
    if (text) {
      Editor.replaceWithText(text);
      bsAiModal.hide();
      showToast('AI text inserted!', 'success');
      _scheduleAutoSave();
    }
  }

  /* ===========================================================
     AUTO-SAVE / DRAFT
  =========================================================== */
  function _scheduleAutoSave() {
    if (editingId) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      const title = document.getElementById('noteTitle')?.value || '';
      const html  = Editor.getHTML();
      if (title || Editor.getText().trim()) {
        Storage.saveDraft({ title, content: html, category: document.getElementById('noteCategory')?.value, color: document.getElementById('noteColor')?.value });
        _flashAutoSave();
      }
    }, 1000);
  }

  function _loadDraft() {
    if (editingId) return;
    const d = Storage.getDraft();
    if (!d) return;
    document.getElementById('noteTitle').value    = d.title    || '';
    document.getElementById('noteCategory').value = d.category || 'Personal';
    if (d.color) { document.getElementById('noteColor').value = d.color; _setColorDot(d.color); }
    Editor.setHTML(d.content || '');
  }

  function _flashAutoSave() {
    const b = document.getElementById('autoSaveBadge');
    b?.classList.add('show');
    setTimeout(() => b?.classList.remove('show'), 2000);
  }

  /* ===========================================================
     SETTINGS
  =========================================================== */
  function _populateSettings() {
    const user = Auth.getUser();
    const accNameEl  = document.getElementById('settingDisplayName');
    const accEmailEl = document.getElementById('settingEmail');
    const apiKeyEl   = document.getElementById('settingGeminiKey');
    if (accNameEl)  accNameEl.value       = user?.displayName || '';
    if (accEmailEl) accEmailEl.textContent = user?.email      || '';
    if (apiKeyEl)   apiKeyEl.value        = Storage.getSettings().geminiApiKey || '';
  }

  function _saveApiKey() {
    const key = document.getElementById('settingGeminiKey')?.value.trim();
    Storage.saveSettings({ geminiApiKey: key });
    showToast('API key saved!', 'success');
  }

  /* ===========================================================
     THEME
  =========================================================== */
  function _applyTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    const isDark = theme === 'dark';
    document.getElementById('themeToggle')?.classList.toggle('active', isDark);
    const lbl = document.getElementById('themeLabel');
    if (lbl) lbl.innerHTML = isDark ? '<i class="fas fa-moon"></i> Dark Mode' : '<i class="fas fa-sun"></i> Light Mode';
    if (save) Storage.saveSettings({ theme });
  }

  /* ===========================================================
     HELPERS
  =========================================================== */
  function _resetForm() {
    document.getElementById('noteForm')?.reset();
    document.getElementById('noteId').value    = '';
    document.getElementById('noteColor').value = 'default';
    _setColorDot('default');
    Editor.clear();
    document.querySelectorAll('#noteForm .is-invalid').forEach(el => el.classList.remove('is-invalid'));
    document.getElementById('quillEditorWrap')?.classList.remove('border-danger');
  }

  function _setColorDot(color) {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === color));
  }

  function _setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  function showToast(msg, type = 'default') {
    const el  = document.getElementById('appToast');
    const msgEl = document.getElementById('toastMsg');
    if (!el || !msgEl) return;
    el.className = 'toast align-items-center border-0';
    el.classList.add(`toast-${type}`);
    msgEl.textContent = msg;
    bsToast?.show();
  }

  /* ===========================================================
     PUBLIC SURFACE
  =========================================================== */
  return { boot, renderAll, showView, showCategory, viewNote, openCreate, openEdit, saveNote, insertAiResult, showToast };
})();

document.addEventListener('DOMContentLoaded', () => App.boot());
