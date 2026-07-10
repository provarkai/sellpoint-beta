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

  window.Auth = { ensureBusiness, requireSession, logout };

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
})();
