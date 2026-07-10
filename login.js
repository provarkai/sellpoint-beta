const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); };

async function boot() {
  const supabase = await window.supabaseReady;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) { const justCreated = await window.Auth.ensureBusiness(session); return (location.href = justCreated ? "onboarding.html" : "app.html"); }

  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("email").value.trim();
    const password = $("password").value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message);
    const justCreated = await window.Auth.ensureBusiness(data.session);
    location.href = justCreated ? "onboarding.html" : "app.html";
  };
}
boot().catch((err) => toast(err.message || "Something went wrong loading this page."));
