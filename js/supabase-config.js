/**
 * supabase-config.js – Initialise the Supabase client.
 */
(function () {
  const SUPABASE_URL = 'https://vfbbtpeptnfbeknmphgm.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmYmJ0cGVwdG5mYmVrbm1waGdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5Mzc0NjIsImV4cCI6MjA5NzUxMzQ2Mn0.' +
    'hm1TViGxXp-WSxYx-HGFfpd2UZUMjXh_JL14bF55cqs';

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
