const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "SellersPoint <founders@sellerspoint.africa>";
const RESEND_BASE_URL = "https://api.resend.com";

function isConfigured() {
  return !!RESEND_API_KEY;
}

// Same graceful-degrade shape as payments.js: with no key set, callers can
// still exercise the signup flow in local dev without a Resend account -
// the send is logged and skipped instead of throwing.
async function send({ to, subject, html }) {
  if (!isConfigured()) {
    console.log(`[email] RESEND_API_KEY not set, skipping send to ${to}: "${subject}"`);
    return { skipped: true };
  }
  const res = await fetch(`${RESEND_BASE_URL}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A failed welcome email shouldn't fail the signup itself - log and move on.
    console.error("[email] Resend send failed:", body.message || res.status);
    return { skipped: true, error: body.message || `HTTP ${res.status}` };
  }
  return { skipped: false, id: body.id };
}

function welcomeEmailHtml({ ownerName, businessName, referralCode, siteUrl }) {
  const referralLink = `${siteUrl}/founding-members.html?ref=${encodeURIComponent(referralCode)}`;
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
      <h1 style="color:#147d64;font-size:22px">Welcome to SellersPoint, ${escapeHtml(ownerName)}.</h1>
      <p>You're now a Founding Member for <strong>${escapeHtml(businessName)}</strong> - your invitation has been reserved.</p>
      <p>Your referral link (share it to move up the list):</p>
      <p style="background:#f0faf6;border:1px solid #dfe7df;border-radius:8px;padding:12px;word-break:break-all">
        <a href="${referralLink}" style="color:#147d64;font-weight:bold">${referralLink}</a>
      </p>
      <p>We'll be in touch as SellersPoint gets closer to launch. Smart business. Limitless growth.</p>
      <p style="color:#647067;font-size:13px">Built in Lagos. Designed for Africa. Ready for the world.</p>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function sendWaitlistWelcomeEmail({ to, ownerName, businessName, referralCode, siteUrl }) {
  return send({
    to,
    subject: "You're in - Welcome to SellersPoint Founding Members",
    html: welcomeEmailHtml({ ownerName, businessName, referralCode, siteUrl }),
  });
}

module.exports = { isConfigured, sendWaitlistWelcomeEmail };
