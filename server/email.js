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
// Where in-app Feedback submissions get emailed to - see the /api/feedback
// route, which sends here with Reply-To set to the submitting seller's own
// email, so replying in your inbox goes straight back to them.
const FEEDBACK_NOTIFY_EMAIL = process.env.FEEDBACK_NOTIFY_EMAIL || "support@sellerspoint.ng";

function isConfigured() {
  return !!RESEND_API_KEY;
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, html, text, reply_to: replyTo || undefined }),
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
  const name = String(businessName || "Seller").replace(/[<>&]/g, "");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
<div style="text-align:center;margin-bottom:28px"><img src="https://sellerspoint.app/assets/branding/logo/logo_1_main-real.png" alt="SellersPoint" style="max-width:180px;height:auto"></div>
<p style="margin:0 0 4px">Hi ${name},</p>
<h1 style="color:#147d64;font-size:22px;margin:0 0 16px">Welcome to SellersPoint!</h1>
<p>We're excited to have you on board. Run your entire business from one intelligent platform. Manage inventory, customers, orders, invoices, receipts, WhatsApp, AI and reports — all from one beautifully simple app built for African entrepreneurs.</p>
<p>You're just a few steps away from setting up your business.</p>
<p><strong>Here's how to get started in the next 5 minutes:</strong></p>
<ul style="line-height:1.9;padding-left:20px">
<li><strong>Add your payment details</strong> - so you're ready to get paid</li>
<li><strong>Add your first product</strong> - takes under a minute</li>
<li><strong>Add your first customer</strong> - or import your existing list</li>
<li><strong>Share your storefront link</strong> - and take your first order</li>
</ul>
<p><a href="https://sellerspoint.app/app.html" style="display:inline-block;background:#147d64;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Open your dashboard →</a></p>
<p>If you have any questions, suggestions, or run into anything at all — tap <strong>Feedback</strong> inside the app and send us a message. We respond personally.</p>
<p>SellersPoint was built with your type of business in mind.</p>
<p style="margin-top:24px;color:#647067;font-size:13px">— The SellersPoint Team</p>
</div>`;
}

function feedbackEmailHtml({ businessName, sellerEmail, message, rating }) {
  const biz = String(businessName || "A business").replace(/[<>&]/g, "");
  const from = String(sellerEmail || "unknown").replace(/[<>&]/g, "");
  const stars = rating ? "★".repeat(rating) + "☆".repeat(5 - rating) + ` (${rating}/5)` : "No rating given";
  const safeMessage = String(message || "").replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m])).replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
<h1 style="color:#147d64;font-size:20px;margin:0 0 16px">New feedback from ${biz}</h1>
<p style="margin:0 0 4px;color:#647067;font-size:13px">From</p>
<p style="margin:0 0 16px;font-weight:700">${from}</p>
<p style="margin:0 0 4px;color:#647067;font-size:13px">Rating</p>
<p style="margin:0 0 16px;font-weight:700">${stars}</p>
<p style="margin:0 0 4px;color:#647067;font-size:13px">Message</p>
<p style="margin:0;padding:14px 16px;background:#f5f7f4;border-radius:8px">${safeMessage}</p>
<p style="margin-top:20px;color:#647067;font-size:13px">Reply to this email to respond directly to ${from}.</p>
</div>`;
}

module.exports = { isConfigured, sendEmail, addToAudience, welcomeEmailHtml, feedbackEmailHtml, FEEDBACK_NOTIFY_EMAIL };
