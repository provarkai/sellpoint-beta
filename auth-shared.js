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

  // Google/Apple both go through the same OAuth redirect flow - Supabase
  // handles the provider-specific details once enabled in the project's
  // Auth settings. login.html's boot() already knows how to pick up a
  // returning session and run ensureBusiness(), so every provider redirects
  // back there rather than duplicating that logic per provider.
  async function signInWithProvider(provider) {
    const supabase = await window.supabaseReady;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + "/login.html" } });
    if (error) throw error;
  }

  // Phone auth is two calls: request a code, then verify it. Supabase treats
  // an unrecognized phone number as a new signup automatically, so this one
  // flow covers both signup.html and login.html.
  async function sendPhoneOtp(phone) {
    const supabase = await window.supabaseReady;
    const formatted = phone.startsWith("+") ? phone : "+" + phone.replace(/\D/g, "");
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
    if (error) throw error;
    return formatted;
  }
  async function verifyPhoneOtp(phone, token) {
    const supabase = await window.supabaseReady;
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    if (error) throw error;
    return data.session;
  }

  window.Auth = { ensureBusiness, requireSession, logout, signInWithProvider, sendPhoneOtp, verifyPhoneOtp };

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

  // Wires the Google/Apple/Phone auth block that's identical markup on both
  // login.html and signup.html, so neither page's own script needs to repeat
  // this. No-ops if the elements aren't on the page.
  function wireAuthExtras() {
    const google = document.getElementById("googleAuth");
    const apple = document.getElementById("appleAuth");
    if (google) google.onclick = () => signInWithProvider("google").catch((err) => toastFallback(err.message));
    if (apple) apple.onclick = () => signInWithProvider("apple").catch((err) => toastFallback(err.message));

    const showPhone = document.getElementById("showPhoneAuth");
    const phoneForm = document.getElementById("phoneForm");
    const otpForm = document.getElementById("phoneOtpForm");
    if (!showPhone || !phoneForm || !otpForm) return;
    showPhone.onclick = () => { phoneForm.style.display = "grid"; showPhone.style.display = "none"; };
    let pendingPhone = "";
    phoneForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        pendingPhone = await sendPhoneOtp(document.getElementById("phoneNumber").value.trim());
        phoneForm.style.display = "none";
        otpForm.style.display = "grid";
        toastFallback("Code sent");
      } catch (err) {
        toastFallback(err.message);
      }
    };
    otpForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const session = await verifyPhoneOtp(pendingPhone, document.getElementById("phoneOtp").value.trim());
        const justCreated = await ensureBusiness(session);
        location.href = justCreated ? "onboarding.html" : "app.html";
      } catch (err) {
        toastFallback(err.message);
      }
    };
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
