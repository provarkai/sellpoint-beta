import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Classic (non-module) scripts can't use top-level await or import, so this
// runs as the one module script on the page and hands off a plain Promise
// that any regular <script> can await inside an async function.
window.supabaseReady = fetch("/api/config")
  .then((r) => r.json())
  .then(({ supabaseUrl, supabaseAnonKey }) => createClient(supabaseUrl, supabaseAnonKey));
