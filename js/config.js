/**
 * config.js – Pre-loads default API keys into localStorage so every
 * AI feature works immediately without manual Settings setup.
 * Runs before app.js; only sets a key if the user has not saved one yet.
 */
(function () {
  const STORAGE_KEY = 'snk_v2_settings';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }

  const defaults = {
    geminiApiKey: '',
  };

  const current = load();
  let dirty = false;

  for (const [k, v] of Object.entries(defaults)) {
    if (!current[k]) {          // only fill in if empty / missing
      current[k] = v;
      dirty = true;
    }
  }

  if (dirty) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }
})();
