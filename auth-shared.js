// Loaded as a plain classic script (not type="module") on every authenticated
// page, after supabase-init.js. Wrapped in an IIFE and attached only as
// window.Auth so it can't collide with the `$`/`toast` top-level consts each
// page's own script (app.js/upgrade.js/backend.js) already declares.
(function () {
  // Business creation is deferred to first login (not done at signup time)
  // because Supabase may require email confirmation before a session exists -
  // this way both "confirmation on" and "confirmation off" projects work the
  // same way, driven by the businessName captured in signup's user_metadata.
  // Returns true the one time it actually creates a business, so callers
  // (signup.js/login.js) know to route a brand-new account through
  // onboarding.html instead of straight to the dashboard.
  async function ensureBusiness(session) {
    const token = session.access_token;
    const me = await fetch("/api/me", { headers: { Authorization: "Bearer " + token } }).then((r) => r.json());
    if (!me.business) {
      const businessName = session.user.user_metadata?.businessName || "Your Business";
      const businessPhone = session.user.user_metadata?.businessPhone || "";
      await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ businessName, businessPhone }),
      });
      return true;
    }
    return false;
  }

  async function requireSession() {
    const supabase = await window.supabaseReady;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      location.href = "login.html";
      return null;
    }
    return { supabase, session };
  }

  async function logout() {
    const supabase = await window.supabaseReady;
    await supabase.auth.signOut();
    location.href = "login.html";
  }

  // Supabase handles the provider-specific OAuth details once Google is
  // enabled in the project's Auth settings. login.html's boot() already
  // knows how to pick up a returning session and run ensureBusiness(), so
  // this redirects back there rather than duplicating that logic.
  async function signInWithProvider(provider) {
    const supabase = await window.supabaseReady;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + "/login.html" } });
    if (error) throw error;
  }

  window.Auth = { ensureBusiness, requireSession, logout, signInWithProvider };

  // Wires up any <button class="pw-toggle" data-for="fieldId"> next to a
  // password input - shared across login/signup/reset-password so the
  // show/hide behavior and label stay consistent everywhere.
  function wirePasswordToggles() {
    document.querySelectorAll(".pw-toggle").forEach((btn) => {
      const input = document.getElementById(btn.dataset.for);
      if (!input) return;
      btn.onclick = () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.textContent = showing ? "Show" : "Hide";
      };
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wirePasswordToggles);
  else wirePasswordToggles();

  // Wires the Google auth button that's identical markup on both login.html
  // and signup.html, so neither page's own script needs to repeat this.
  // No-ops if the button isn't on the page.
  function wireAuthExtras() {
    const google = document.getElementById("googleAuth");
    if (google) google.onclick = () => signInWithProvider("google").catch((err) => toastFallback(err.message));
  }
  function toastFallback(m) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = m;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireAuthExtras);
  else wireAuthExtras();
})();
