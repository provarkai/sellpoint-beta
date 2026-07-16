const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); };

async function boot() {
  const supabase = await window.supabaseReady;
  // A referral link (another business's own share link, or a
  // founding-members waitlist link that led here) carries the code as
  // ?ref=CODE - stashed in user_metadata now since it's only usable once
  // the account (and its business) actually exists a moment from now.
  const params = new URLSearchParams(location.search);
  const referredByCode = params.get("ref") || "";
  // Prefills from the quick sign-up box on the WordPress homepage
  // (sellerspoint.ng), which only collects business name + email before
  // redirecting here to finish - so the visitor is one step from done
  // instead of retyping what they already gave.
  if (params.get("businessName")) $("businessName").value = params.get("businessName");
  if (params.get("email")) $("email").value = params.get("email");

  $("signupForm").onsubmit = async (e) => {
    e.preventDefault();
    const businessName = $("businessName").value.trim();
    const businessPhone = $("businessPhone").value.replace(/\D/g, "");
    const email = $("email").value.trim();
    const password = $("password").value;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { businessName, businessPhone, referredByCode } } });
    if (error) return toast(error.message || error.error_description || "Something went wrong - please try again.");
    if (data.session) {
      // Email confirmation is off on this Supabase project - session is
      // already valid, so create the business now and go straight in.
      const justCreated = await window.Auth.ensureBusiness(data.session);
      if (justCreated && window.track) track("signup_completed");
      location.href = justCreated ? "onboarding.html" : "app.html";
    } else {
      toast("Check your email to confirm your account, then log in.");
      setTimeout(() => (location.href = "login.html"), 2500);
    }
  };
}
boot().catch((err) => toast(err.message || "Something went wrong loading this page."));
