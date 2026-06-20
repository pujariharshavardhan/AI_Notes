/**
 * supabase-config.js – Initialise the Supabase client.
 */
(function () {
  const SUPABASE_URL = 'https://flqotwokqcpjwrgxsjrq.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZscW90d29rcWNwandyZ3hzanJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MjU4NjEsImV4cCI6MjA5NzUwMTg2MX0.' +
    'LevnkfcdgMAu2DZi9Vvd0FJ5pK5qZvGuLIW6dVz_CsE';

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
