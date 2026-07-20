import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Classic (non-module) scripts can't use top-level await or import, so this
// runs as the one module script on the page and hands off a plain Promise
// that any regular <script> can await inside an async function.
// persistSession/autoRefreshToken are Supabase's own defaults, but set
// explicitly so a session, once created, keeps renewing itself via the
// refresh token in the background for as long as the browser has it
// stored - sellers stay signed in across visits instead of hitting a
// short client-side timeout.
window.supabaseReady = fetch("/api/config")
  .then((r) => r.json())
  .then(({ supabaseUrl, supabaseAnonKey }) =>
    createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  );
