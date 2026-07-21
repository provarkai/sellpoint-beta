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

// Personalized daily business summary - real numbers only, built from
// db.getDailyDigestData (today's sales/orders/new customers, low stock,
// this month's P&L, pending payments). See server/scheduler.js#runDailyDigestScan
// for how/when this actually gets sent, and the /api/digest/unsubscribe
// route in server/index.js for the one-click opt-out this links to.
function dailyDigestEmailHtml({ businessName, currency, todayRevenue, todayOrders, todayNewCustomers, lowStock, pendingCount, pl, unsubscribeUrl }) {
  const biz = String(businessName || "there").replace(/[<>&]/g, "");
  const money = (n) => `${currency || "NGN"} ${Number(n || 0).toLocaleString("en-NG")}`;
  const dateLabel = new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" });
  const lowStockHtml = lowStock.length
    ? `<ul style="margin:0;padding-left:20px">${lowStock.map((p) => `<li>${String(p.name).replace(/[<>&]/g, "")} - ${p.stock} left</li>`).join("")}</ul>`
    : `<p style="margin:0;color:#647067">Nothing running low today.</p>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
<p style="margin:0 0 4px">Hi ${biz},</p>
<h1 style="color:#147d64;font-size:20px;margin:0 0 16px">Your SellersPoint digest - ${dateLabel}</h1>
<div style="display:flex;gap:12px;margin-bottom:20px">
<div style="flex:1;background:#f5f7f4;border-radius:8px;padding:12px"><small style="color:#647067;font-size:12px">Revenue today</small><br><b style="font-size:18px">${money(todayRevenue)}</b></div>
<div style="flex:1;background:#f5f7f4;border-radius:8px;padding:12px"><small style="color:#647067;font-size:12px">Orders today</small><br><b style="font-size:18px">${todayOrders}</b></div>
<div style="flex:1;background:#f5f7f4;border-radius:8px;padding:12px"><small style="color:#647067;font-size:12px">New customers</small><br><b style="font-size:18px">${todayNewCustomers}</b></div>
</div>
<p style="margin:0 0 6px;font-weight:700">⚠️ Restock alerts</p>
${lowStockHtml}
<p style="margin:20px 0 6px;font-weight:700">This month so far</p>
<p style="margin:0;color:#17211c">Revenue ${money(pl.revenue)} · Expenses ${money(pl.expensesTotal)} · Net profit ${money(pl.netProfit)}</p>
${pendingCount > 0 ? `<p style="margin:16px 0 0;padding:12px 16px;background:#fff4e8;border-radius:8px;color:#d36b2c;font-weight:700">${pendingCount} order${pendingCount === 1 ? "" : "s"} still pending payment - a nudge on WhatsApp might help.</p>` : ""}
<p style="margin-top:24px"><a href="https://sellerspoint.app/app.html" style="display:inline-block;background:#147d64;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Open your dashboard →</a></p>
<p style="margin-top:28px;color:#8fa89b;font-size:12px"><a href="${unsubscribeUrl}" style="color:#8fa89b">Unsubscribe from daily digests</a></p>
</div>`;
}

// Shared by newOrderEmailHtml/paymentReceivedEmailHtml/orderConfirmationEmailHtml
// so the three order-related emails render line items identically.
function orderItemsTableHtml(items, currency) {
  const money = (n) => `${currency || "NGN"} ${Number(n || 0).toLocaleString("en-NG")}`;
  const rows = (items || [])
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${String(i.productName || "").replace(/[<>&]/g, "")} × ${i.qty}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${money(i.unitPrice * i.qty)}</td></tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">${rows}</table>`;
}

// Seller-facing - fires on every new order (dashboard, POS, or storefront),
// regardless of its starting payment status. See db.notifyNewOrder.
function newOrderEmailHtml({ businessName, currency, customerName, items, total, orderId, source }) {
  const biz = String(businessName || "there").replace(/[<>&]/g, "");
  const cust = String(customerName || "A customer").replace(/[<>&]/g, "");
  const sourceLabel = { storefront: "your storefront", pos: "POS", dashboard: "the dashboard" }[source] || "SellersPoint";
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
<h1 style="color:#147d64;font-size:20px;margin:0 0 16px">🛒 New order from ${cust}</h1>
<p style="margin:0 0 16px;color:#647067">Placed via ${sourceLabel}.</p>
${orderItemsTableHtml(items, currency)}
<p style="margin:0;font-weight:700;font-size:16px">Total: ${currency || "NGN"} ${Number(total || 0).toLocaleString("en-NG")}</p>
<p style="margin-top:24px"><a href="https://sellerspoint.app/app.html" style="display:inline-block;background:#147d64;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">View in dashboard →</a></p>
<p style="margin-top:20px;color:#8fa89b;font-size:12px">Order ${orderId} · ${biz}</p>
</div>`;
}

// Seller-facing - fires once, the first time an order transitions to Paid
// (see db.notifySellerPaymentReceived's atomic dedup via paid_email_sent).
function paymentReceivedEmailHtml({ businessName, currency, customerName, items, total, orderId }) {
  const cust = String(customerName || "A customer").replace(/[<>&]/g, "");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
<h1 style="color:#147d64;font-size:20px;margin:0 0 16px">💰 Payment received from ${cust}</h1>
${orderItemsTableHtml(items, currency)}
<p style="margin:0;font-weight:700;font-size:16px">Total: ${currency || "NGN"} ${Number(total || 0).toLocaleString("en-NG")}</p>
<p style="margin-top:24px"><a href="https://sellerspoint.app/app.html" style="display:inline-block;background:#147d64;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">View in dashboard →</a></p>
<p style="margin-top:20px;color:#8fa89b;font-size:12px">Order ${orderId} · ${String(businessName || "").replace(/[<>&]/g, "")}</p>
</div>`;
}

// Customer-facing - fires the moment a storefront order is placed (before
// payment completes), so it reads as "we got your order", not "you paid".
// See db.notifyCustomerOrderConfirmation.
function orderConfirmationEmailHtml({ businessName, currency, customerName, items, total, orderId }) {
  const biz = String(businessName || "the seller").replace(/[<>&]/g, "");
  const cust = String(customerName || "there").replace(/[<>&]/g, "");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
<p style="margin:0 0 4px">Hi ${cust},</p>
<h1 style="color:#147d64;font-size:20px;margin:0 0 16px">Thanks for your order from ${biz}!</h1>
<p style="margin:0 0 12px;color:#647067">Here's what you ordered:</p>
${orderItemsTableHtml(items, currency)}
<p style="margin:0;font-weight:700;font-size:16px">Total: ${currency || "NGN"} ${Number(total || 0).toLocaleString("en-NG")}</p>
<p style="margin-top:20px;color:#647067">${biz} will be in touch once your order is confirmed and on its way.</p>
<p style="margin-top:20px;color:#8fa89b;font-size:12px">Order reference: ${orderId}</p>
</div>`;
}

// Invitee-facing - fires when an owner/manager invites someone to join
// their business's team. Acceptance today only works by signing up fresh
// with this exact email at sellerspoint.app (see db.createBusiness's
// pending-invite check) - it doesn't yet cover someone who already owns a
// different SellersPoint business, which is a real gap but a separate one
// from just getting the invite email out.
function staffInviteEmailHtml({ businessName }) {
  const biz = String(businessName || "A business").replace(/[<>&]/g, "");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
<h1 style="color:#147d64;font-size:20px;margin:0 0 16px">You've been invited to join ${biz}</h1>
<p>You've been invited to join <strong>${biz}</strong> on SellersPoint as a team member.</p>
<p>Sign up with this same email address and you'll be added to their team automatically.</p>
<p style="margin-top:24px"><a href="https://sellerspoint.app/signup.html" style="display:inline-block;background:#147d64;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Accept invite →</a></p>
<p style="margin-top:20px;color:#647067;font-size:13px">Already have a SellersPoint account under this email? Just log in and you'll be added.</p>
</div>`;
}

// Fires once, a few days before a signup's 14-day Pro trial lapses (see
// db.listTrialsEndingSoon / server/scheduler.js#runTrialReminderScan).
// Deliberately doesn't say exactly how many days are left - the 2-3 day
// scan window this is sent from means "days left" would sometimes read 2
// and sometimes 3 depending on when the scan happened to run, which reads
// as sloppy - "in a few days" stays true either way.
function trialEndingEmailHtml({ businessName }) {
  const biz = String(businessName || "there").replace(/[<>&]/g, "");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#17211c">
<p style="margin:0 0 4px">Hi ${biz},</p>
<h1 style="color:#147d64;font-size:20px;margin:0 0 16px">Your free trial ends in a few days</h1>
<p>You've been using SellersPoint's Business Starter plan free for the last two weeks - staff seats, POS mode, batch tracking, suppliers & purchase orders, and more.</p>
<p>If you don't subscribe before your trial ends, your account switches to the free plan - you'll keep everything you've already entered, but Business Starter-only features and higher limits won't be available until you upgrade again.</p>
<p style="margin-top:24px"><a href="https://sellerspoint.app/upgrade.html" style="display:inline-block;background:#147d64;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Keep Business Starter - Subscribe now →</a></p>
<p style="margin-top:20px;color:#647067;font-size:13px">Questions about which plan fits your business? Just reply to this email.</p>
</div>`;
}

module.exports = {
  isConfigured,
  sendEmail,
  addToAudience,
  welcomeEmailHtml,
  feedbackEmailHtml,
  dailyDigestEmailHtml,
  newOrderEmailHtml,
  paymentReceivedEmailHtml,
  orderConfirmationEmailHtml,
  staffInviteEmailHtml,
  trialEndingEmailHtml,
  FEEDBACK_NOTIFY_EMAIL,
};
