/**
 * firebase-config.js
 * Tries to load Firebase config from localStorage (saved via Settings modal).
 * Falls back to local-only mode if no config is present.
 */
(function () {
  const SAVED_KEY = 'snk_firebase_config';
  window.FIREBASE_ENABLED = false;
  window.db   = null;
  window.auth = null;

  function tryInit(cfg) {
    try {
      if (firebase.apps.length > 0) return true; // already initialised
      firebase.initializeApp(cfg);
      window.db   = firebase.firestore();
      window.auth = firebase.auth();
      window.FIREBASE_ENABLED = true;
      return true;
    } catch (e) {
      console.warn('[SNK] Firebase init failed:', e.message);
      return false;
    }
  }

  /* Load saved config on every page start */
  const raw = localStorage.getItem(SAVED_KEY);
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      tryInit(cfg);
    } catch (_) { /* bad JSON – ignore */ }
  }

  /* Public API used by Settings modal */
  window.FirebaseSetup = {
    connect(cfg) {
      const ok = tryInit(cfg);
      if (ok) localStorage.setItem(SAVED_KEY, JSON.stringify(cfg));
      return ok;
    },
    disconnect() {
      localStorage.removeItem(SAVED_KEY);
      window.FIREBASE_ENABLED = false;
      window.db   = null;
      window.auth = null;
      // Full reload so SDK state is clean
      location.reload();
    },
    isConnected() { return window.FIREBASE_ENABLED; },
  };
})();
