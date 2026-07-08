const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3500); };

async function boot() {
  const supabase = await window.supabaseReady;

  function showForm() {
    $("pageNote").textContent = "Choose a new password for your account.";
    $("resetForm").style.display = "grid";
  }

  // Supabase fires PASSWORD_RECOVERY once it's parsed the recovery token out
  // of the URL (detectSessionInUrl, on by default) - that's the reliable
  // signal a valid reset link brought the user here, not just a session
  // check, since a normal logged-in visit to this page has a session too.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") showForm();
  });

  // Fallback: if the link was already consumed by the time this script ran
  // (event fired before the listener attached), a session still exists.
  const { data: { session } } = await supabase.auth.getSession();
  if (session) showForm();
  else setTimeout(() => { if ($("resetForm").style.display === "none") $("pageNote").textContent = "This reset link is invalid or has expired. Request a new one from the login page."; }, 2500);

  $("resetForm").onsubmit = async (e) => {
    e.preventDefault();
    const password = $("password").value;
    const password2 = $("password2").value;
    if (password !== password2) return toast("Passwords don't match");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return toast(error.message);
    toast("Password updated - log in with your new password.");
    await supabase.auth.signOut();
    setTimeout(() => (location.href = "login.html"), 1500);
  };
}
boot().catch((err) => toast(err.message || "Something went wrong loading this page."));
