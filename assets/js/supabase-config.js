// panel/assets/js/supabase-config.js
window.CAMINFO_SUPABASE_URL = "https://wrksctcpxmxyzbqjcsnn.supabase.co";
window.CAMINFO_SUPABASE_ANON_KEY = "sb_publishable_sPlKgTjyA00Sqay2jU98wg_tsFIbVcb";
window.CAMINFO_VAPID_PUBLIC_KEY = "BNOgSy46KvjLigDiz0_8WIuzEJaEBxtpF7FL7anS0M5iGfvw8MDmE1UjFs47qELPl2e4m_ceIl116WheBJXFDt4";

window.caminfoSupabase = window.supabase.createClient(
  window.CAMINFO_SUPABASE_URL,
  window.CAMINFO_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);
