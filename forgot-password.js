const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3500); };

async function boot() {
  const supabase = await window.supabaseReady;
  $("forgotForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("email").value.trim();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + "/reset-password.html",
    });
    // Same message whether or not the email exists - don't let this form be
    // used to check which emails have an account.
    if (error) return toast(error.message);
    toast("If that email has an account, a reset link is on its way.");
    $("forgotForm").reset();
  };
}
boot().catch((err) => toast(err.message || "Something went wrong loading this page."));
