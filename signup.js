const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); };

async function boot() {
  const supabase = await window.supabaseReady;

  $("signupForm").onsubmit = async (e) => {
    e.preventDefault();
    const businessName = $("businessName").value.trim();
    const businessPhone = $("businessPhone").value.replace(/\D/g, "");
    const email = $("email").value.trim();
    const password = $("password").value;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { businessName, businessPhone } } });
    if (error) return toast(error.message);
    if (data.session) {
      // Email confirmation is off on this Supabase project - session is
      // already valid, so create the business now and go straight in.
      await window.Auth.ensureBusiness(data.session);
      location.href = "index.html";
    } else {
      toast("Check your email to confirm your account, then log in.");
      setTimeout(() => (location.href = "login.html"), 2500);
    }
  };
}
boot().catch((err) => toast(err.message || "Something went wrong loading this page."));
