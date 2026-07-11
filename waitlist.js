const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); };
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || "Request failed"); }
  return res.json();
}

// A shared referral link looks like waitlist.html?ref=ABC123 - carry that
// code through to the submission so the referrer gets credit, and let the
// visitor see whose invite they're accepting.
const referredByCode = new URLSearchParams(location.search).get("ref") || "";
if (referredByCode && $("wReferralNote")) {
  $("wReferralNote").textContent = `You were invited with code ${referredByCode.toUpperCase()} - they'll get referral credit when you join.`;
  $("wReferralNote").style.display = "block";
}

$("waitlistForm").onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  btn.disabled = true;
  btn.textContent = "Submitting...";
  try {
    const entry = await api("POST", "/api/waitlist", {
      businessName: $("wBusinessName").value.trim(),
      ownerName: $("wOwnerName").value.trim(),
      email: $("wEmail").value.trim(),
      phone: $("wPhone").value.trim(),
      country: $("wCountry").value.trim(),
      state: $("wState").value.trim(),
      businessCategory: $("wCategory").value,
      businessSize: $("wSize").value,
      yearsInBusiness: $("wYears").value,
      currentChallenges: $("wChallenges").value.trim(),
      newsletterOptIn: $("wNewsletter").checked,
      referredByCode,
    });
    location.href = `/thank-you.html?ref=${encodeURIComponent(entry.referralCode)}`;
  } catch (err) {
    toast(err.message);
    btn.disabled = false;
    btn.textContent = "Become a Founding Member";
  }
};
