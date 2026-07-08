const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); };
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }

async function boot() {
  const ctx = await window.Auth.requireSession();
  if (!ctx) return;
  const token = ctx.session.access_token;

  $("onboardingForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const file = $("oLogo").files?.[0];
      const businessLogo = file ? await readFileAsDataUrl(file) : undefined;
      const body = {
        businessAddress: $("oAddress").value.trim(),
        paymentLink: $("oPaymentLink").value.trim(),
        paymentDetails: $("oPayment").value.trim(),
      };
      if (businessLogo) body.businessLogo = businessLogo;
      const res = await fetch("/api/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not save your setup");
      }
      location.href = "index.html";
    } catch (err) {
      toast(err.message);
    }
  };
}
boot().catch((err) => toast(err.message || "Something went wrong loading this page."));
