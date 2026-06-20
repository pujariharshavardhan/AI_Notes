/**
 * storage.js – Supabase (PostgreSQL) backend for notes.
 */
const Storage = (() => {
  const SETTINGS_KEY = 'snk_v2_settings';
  const DRAFT_KEY    = 'snk_v2_draft';

  let _cache = null;

  /* ============================================================
     UTILITIES
  ============================================================ */
  function _parse(raw, fallback) {
    try { return JSON.parse(raw) ?? fallback; } catch { return fallback; }
  }

  function formatDate(d) {
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  }

  function stripHtml(html) {
    const el = document.createElement('div');
    el.innerHTML = html || '';
    return el.textContent || '';
  }

  /* DB row → app note (snake_case → camelCase) */
  function _fromDb(row) {
    return {
      id:          row.id,
      title:       row.title,
      category:    row.category,
      content:     row.content,
      contentText: row.content_text,
      color:       row.color,
      pinned:      row.pinned,
      favorite:    row.favorite,
      date:        row.date,
      lastModified:row.last_modified,
    };
  }

  /* App patch → DB columns */
  function _toDb(data) {
    const obj = {};
    if (data.title       !== undefined) obj.title        = data.title;
    if (data.category    !== undefined) obj.category     = data.category;
    if (data.content     !== undefined) obj.content      = data.content;
    if (data.contentText !== undefined) obj.content_text = data.contentText;
    if (data.color       !== undefined) obj.color        = data.color;
    if (data.pinned      !== undefined) obj.pinned       = data.pinned;
    if (data.favorite    !== undefined) obj.favorite     = data.favorite;
    if (data.date        !== undefined) obj.date         = data.date;
    if (data.lastModified!== undefined) obj.last_modified= data.lastModified;
    return obj;
  }

  /* ============================================================
     SUPABASE HELPERS
  ============================================================ */
  function _db() { return window.supabaseClient.from('notes'); }

  async function _sbAll() {
    const { data, error } = await _db()
      .select('*')
      .eq('user_id', Auth.getUid())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(_fromDb);
  }

  /* ============================================================
     PUBLIC – NOTES CRUD
  ============================================================ */
  async function getNotes(force = false) {
    if (_cache !== null && !force) return _cache;
    _cache = await _sbAll();
    return _cache;
  }

  async function addNote(data) {
    const now = new Date();
    const row = {
      user_id:      Auth.getUid(),
      title:        data.title       || 'Untitled',
      category:     data.category    || 'Personal',
      content:      data.content     || '',
      content_text: data.contentText || stripHtml(data.content),
      color:        data.color       || 'default',
      pinned:       !!data.pinned,
      favorite:     !!data.favorite,
      date:         formatDate(now),
      last_modified:now.toISOString(),
    };

    const { data: inserted, error } = await _db()
      .insert(row)
      .select()
      .single();
    if (error) throw error;

    const note = _fromDb(inserted);
    if (_cache) _cache.unshift(note);
    return note;
  }

  async function updateNote(id, patch) {
    if (patch.content !== undefined && patch.contentText === undefined) {
      patch.contentText = stripHtml(patch.content);
    }
    patch.lastModified = new Date().toISOString();

    const dbPatch = _toDb(patch);

    const { error } = await _db()
      .update(dbPatch)
      .eq('id', id)
      .eq('user_id', Auth.getUid());
    if (error) throw error;

    if (_cache) {
      const idx = _cache.findIndex(n => n.id === id || n.id === String(id));
      if (idx !== -1) Object.assign(_cache[idx], patch);
    }
  }

  async function deleteNote(id) {
    const { error } = await _db()
      .delete()
      .eq('id', id)
      .eq('user_id', Auth.getUid());
    if (error) throw error;
    if (_cache) _cache = _cache.filter(n => n.id !== id && n.id !== String(id));
  }

  function getNoteById(id) {
    if (!_cache) return null;
    return _cache.find(n => n.id === id || n.id === String(id)) ?? null;
  }

  function getCategories() {
    if (!_cache) return [];
    return [...new Set(_cache.map(n => n.category).filter(Boolean))].sort();
  }

  function invalidateCache() { _cache = null; }
  function getCached()       { return _cache || []; }

  /* ============================================================
     SETTINGS  (localStorage cache + Supabase user_settings sync)
  ============================================================ */
  function getSettings() {
    return _parse(localStorage.getItem(SETTINGS_KEY), { theme: 'light', geminiApiKey: '' });
  }

  function saveSettings(patch) {
    const merged = { ...getSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    /* Sync to Supabase in background (non-blocking) */
    if (Auth.getUid()) {
      window.supabaseClient.from('user_settings').upsert({
        id:                       Auth.getUid(),
        theme:                    merged.theme                    || 'light',
        gemini_api_key:           merged.geminiApiKey            || '',
        cloudinary_cloud_name:    merged.cloudinaryCloudName     || '',
        cloudinary_upload_preset: merged.cloudinaryUploadPreset  || '',
      }, { onConflict: 'id' }).then(({ error }) => {
        if (error) console.warn('[SNK] Settings sync failed:', error.message);
      });
    }
  }

  /** Load settings from Supabase and merge into localStorage cache. */
  async function loadSettingsFromDb() {
    if (!Auth.getUid()) return;
    const { data, error } = await window.supabaseClient
      .from('user_settings').select('*').eq('id', Auth.getUid()).single();
    if (error || !data) return;
    const remote = {
      theme:                    data.theme                    || 'light',
      geminiApiKey:             data.gemini_api_key           || '',
      cloudinaryCloudName:      data.cloudinary_cloud_name    || '',
      cloudinaryUploadPreset:   data.cloudinary_upload_preset || '',
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...getSettings(), ...remote }));
  }

  /* ============================================================
     DRAFT  (localStorage cache + Supabase note_drafts sync)
  ============================================================ */
  function getDraft() { return _parse(localStorage.getItem(DRAFT_KEY), null); }

  function saveDraft(d) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    if (Auth.getUid()) {
      window.supabaseClient.from('note_drafts').upsert({
        id:       Auth.getUid(),
        title:    d.title    || '',
        content:  d.content  || '',
        category: d.category || 'Personal',
        color:    d.color    || 'default',
        saved_at: new Date().toISOString(),
      }, { onConflict: 'id' }).then(({ error }) => {
        if (error) console.warn('[SNK] Draft sync failed:', error.message);
      });
    }
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    if (Auth.getUid()) {
      window.supabaseClient.from('note_drafts').delete()
        .eq('id', Auth.getUid()).then(() => {});
    }
  }

  /** Load draft from Supabase (e.g. user switches device). */
  async function loadDraftFromDb() {
    if (!Auth.getUid()) return;
    const { data, error } = await window.supabaseClient
      .from('note_drafts').select('*').eq('id', Auth.getUid()).single();
    if (error || !data) return;
    const draft = { title: data.title, content: data.content, category: data.category, color: data.color };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  /* ============================================================
     EXPORT – PDF
  ============================================================ */
  async function exportAllPdf() {
    const notes = await getNotes();
    const date  = formatDate(new Date());

    const notesHtml = notes.length
      ? notes.map(n => `
        <div class="note">
          <h2>${n.title || 'Untitled'}</h2>
          <div class="meta">
            <span>&#128193; ${n.category || 'Personal'}</span>
            <span>&#128197; ${n.date || ''}</span>
            ${n.pinned   ? '<span>&#128204; Pinned</span>'   : ''}
            ${n.favorite ? '<span>&#11088; Favourite</span>' : ''}
          </div>
          <div class="content">${n.content || '<em>No content</em>'}</div>
        </div>`).join('')
      : '<p style="color:#64748b">No notes found.</p>';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Smart Notes Export – ${date}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
    h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: .9rem; margin-bottom: 32px; }
    .note { page-break-inside: avoid; margin-bottom: 28px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; }
    .note h2 { margin: 0 0 8px; color: #1e293b; font-size: 1.1rem; }
    .meta { font-size: .78rem; color: #64748b; margin-bottom: 12px; display: flex; gap: 14px; flex-wrap: wrap; }
    .content { font-size: .92rem; line-height: 1.65; }
    .footer { margin-top: 40px; font-size: .75rem; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>&#128221; Smart Notes Export</h1>
  <p class="subtitle">Exported on ${date} &bull; ${notes.length} note${notes.length !== 1 ? 's' : ''}</p>
  ${notesHtml}
  <div class="footer">Smart Notes Keeper &mdash; PDF Export</div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Please allow pop-ups to export PDF.'); return; }
    win.document.write(html);
    win.document.close();
  }

  return {
    formatDate, stripHtml,
    getNotes, getCached, addNote, updateNote, deleteNote, getNoteById, getCategories, invalidateCache,
    getSettings, saveSettings, loadSettingsFromDb,
    getDraft, saveDraft, clearDraft, loadDraftFromDb,
    exportAllPdf,
  };
})();
