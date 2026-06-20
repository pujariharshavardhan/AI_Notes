/**
 * auth.js – Supabase Authentication wrapper.
 */
const Auth = (() => {
  let _user        = null;
  let _onLoginCb   = null;
  let _onLogoutCb  = null;
  let _prevUserId  = undefined;

  /* ── bootstrap ── */
  function init(onLogin, onLogout) {
    _onLoginCb  = onLogin;
    _onLogoutCb = onLogout;

    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      const user   = session?.user || null;
      const userId = user?.id || null;

      if (userId === _prevUserId) return;
      _prevUserId = userId;

      if (user) {
        _user = user;
        _onLoginCb && _onLoginCb(_toAppUser(user));
      } else {
        _user = null;
        _onLogoutCb && _onLogoutCb();
      }
    });
  }

  /* App-friendly user shape */
  function _toAppUser(u) {
    return {
      uid:         u.id,
      email:       u.email,
      displayName: u.user_metadata?.display_name || u.email?.split('@')[0] || 'User',
      photoURL:    u.user_metadata?.avatar_url   || null,
    };
  }

  /* Redirect URL — always points back to this page */
  function _redirectUrl() {
    return window.location.origin + window.location.pathname;
  }

  /* ── email / password ── */
  async function login(email, password) {
    const { data, error } = await window.supabaseClient.auth
      .signInWithPassword({ email, password });
    if (error) throw error;
    return _toAppUser(data.user);
  }

  async function register(email, password, displayName) {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data:            { display_name: displayName },
        emailRedirectTo: _redirectUrl(),   /* ← tells Supabase where to redirect after confirmation */
      },
    });
    if (error) throw error;
    return { user: data.user, needsConfirmation: !data.session };
  }

  async function sendPasswordReset(email) {
    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: _redirectUrl(),
    });
    if (error) throw error;
  }

  async function updateDisplayName(name) {
    const { data, error } = await window.supabaseClient.auth
      .updateUser({ data: { display_name: name } });
    if (error) throw error;
    _user = data.user;
  }

  /* ── logout ── */
  async function logout() {
    const { error } = await window.supabaseClient.auth.signOut();
    if (error) throw error;
  }

  /* ── getters ── */
  function getUser()    { return _user ? _toAppUser(_user) : null; }
  function getUid()     { return _user?.id || null; }
  function isLoggedIn() { return !!_user; }

  return {
    init, login, register, logout,
    sendPasswordReset, updateDisplayName,
    getUser, getUid, isLoggedIn,
  };
})();
