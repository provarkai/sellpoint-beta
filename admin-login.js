const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); };

async function checkIsAdmin(token) {
  const res = await fetch("/api/admin/settings", { headers: { Authorization: "Bearer " + token } });
  return res.ok;
}

async function boot() {
  const supabase = await window.supabaseReady;
  const { data: { session } } = await supabase.auth.getSession();
  if (session && (await checkIsAdmin(session.access_token))) {
    return (location.href = "backend.html");
  }

  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("email").value.trim();
    const password = $("password").value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message);
    if (!(await checkIsAdmin(data.session.access_token))) {
      await supabase.auth.signOut();
      return toast("This account is not authorized for platform admin access");
    }
    location.href = "backend.html";
  };
}
boot().catch((err) => toast(err.message || "Something went wrong loading this page."));
