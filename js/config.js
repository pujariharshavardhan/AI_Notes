/**
 * config.js – Pre-loads default API key (encrypted) into localStorage.
 */
(function () {
  const STORAGE_KEY = 'snk_v2_settings';

  /* ── Decryption (XOR + Base64) ── */
  function _d(e, s) {
    return atob(e).split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ s.charCodeAt(i % s.length))
    ).join('');
  }

  const _e = 'CTBcAA95OwBZPRYQCXAORRAsEwoZHgITOzUaFT8LODMBGxkkOgopeiIjLEAXCns5IwICAwk=';
  const _s = ['HarAm', 'AiNotes', '$2026$', 'Secure'].join('');

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }

  const current = load();
  current.geminiApiKey = _d(_e, _s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
})();
