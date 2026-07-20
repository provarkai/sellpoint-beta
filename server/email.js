// Thin Resend client - transactional email (signup welcome) plus adding new
// signups to a Resend Audience so they can be included in a Broadcast
// (newsletter) later, composed and sent from the Resend dashboard itself
// rather than a composer built into this app.
// RESEND_API_KEY must be set as a server env var (Railway Variables tab,
// never in the client or committed to git) - never hardcode a key here.
// RESEND_FROM_EMAIL must be an address on a domain verified in Resend
// (Domains tab) - sending fails otherwise, Resend doesn't allow arbitrary
// From addresses. RESEND_AUDIENCE_ID is optional - copy it from Resend's
// Audiences tab once you've created one; without it, welcome emails still
// send, addToAudience just no-ops so newsletter sign-up isn't a hard
// requirement for the rest of this module to work.
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "SellersPoint <onboarding@sellerspoint.app>";
const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID || "";

function isConfigured() {
  return !!RESEND_API_KEY;
}

async function sendEmail({ to, subject, html, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, html, text }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || "Resend request failed");
  return body;
}

async function addToAudience({ email, firstName }) {
  if (!RESEND_AUDIENCE_ID) return;
  const res = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, first_name: firstName || undefined, unsubscribed: false }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || "Resend audience request failed");
  }
}

function welcomeEmailHtml(businessName) {
  const name = String(businessName || "there").replace(/[<>&]/g, "");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
<h1 style="color:#147d64;font-size:22px;margin:0 0 12px">Welcome to SellersPoint, ${name}! 🎉</h1>
<p>Your account is ready. Here's how to get moving fast:</p>
<ul style="line-height:1.8">
<li>Add your first product</li>
<li>Add your first customer</li>
<li>Share your storefront link and take your first order</li>
</ul>
<p><a href="https://sellerspoint.app/app.html" style="display:inline-block;background:#147d64;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Open your dashboard →</a></p>
<p style="color:#647067;font-size:13px">Questions? Just reply to this email.</p>
</div>`;
}

module.exports = { isConfigured, sendEmail, addToAudience, welcomeEmailHtml };
