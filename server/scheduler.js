// AI Automation (Slice Three item 3): proactive payment reminders. No cron
// infra exists anywhere in this codebase, and the app runs as one persistent
// Node process (Railway) - so a plain setInterval-based scan is enough;
// adding node-cron for "scan a few times a day" goes against this
// codebase's consistently minimal-dependency style (see validate.js's
// explicit "kept dependency-free" comment).
const db = require("./db");
const whatsapp = require("./whatsapp");
const email = require("./email");

const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 4x/day; isOrderDueForAutoReminder's
// own date math (not wall-clock alignment) is what prevents duplicate sends,
// so polling more often than once/day is safe.
const APP_BASE_URL = process.env.APP_BASE_URL || "https://sellerspoint.app";

async function runAutoReminderScan() {
  if (!whatsapp.isConfigured()) return;
  const businesses = await db.listBusinessesWithAutoReminderEnabled();
  for (const b of businesses) {
    try {
      const result = await db.sendAutoRemindersForBusiness(b.id, b.auto_reminder_days_after, whatsapp);
      if (result.total) console.log(`[scheduler] business ${b.id}: sent ${result.sent}/${result.total} auto-reminders`);
    } catch (err) {
      // Error isolation: one business's failure (bad phone data, DB hiccup,
      // WasenderAPI outage) must never stop the loop for the rest.
      console.error(`[scheduler] auto-reminder scan failed for business ${b.id}:`, err.message);
    }
  }
}

// Recurring retention campaigns (weekly/monthly "still here" style
// broadcasts) - same interval, same error-isolation shape as the
// auto-reminder scan above. Sends via the existing sendCampaign(), which
// already handles quota checks, {name} personalization, and message
// logging - this job just decides *when* a stored campaign is due and
// stamps last_sent_at once it's gone out.
async function runRecurringCampaignScan() {
  if (!whatsapp.isConfigured()) return;
  const due = await db.listDueRecurringCampaigns();
  for (const c of due) {
    try {
      const result = await db.sendCampaign(c.businessId, { audience: { type: c.audienceType, segment: c.segment }, message: c.message }, whatsapp);
      await db.markRecurringCampaignSent(c.id);
      console.log(`[scheduler] recurring campaign ${c.id}: sent ${result.sent}/${result.total}`);
    } catch (err) {
      console.error(`[scheduler] recurring campaign ${c.id} failed:`, err.message);
    }
  }
}

// Personalized daily business summary - see db.getDailyDigestData for what
// goes in it and email.dailyDigestEmailHtml for the template. Runs on the
// same poll interval as everything else in this file; it's
// listBusinessesDueForDigest's own last_digest_sent_date check (not the
// interval) that keeps this to once per calendar day per business, same
// "date math, not wall-clock alignment" pattern as the auto-reminder scan.
async function runDailyDigestScan() {
  if (!email.isConfigured()) return;
  const businesses = await db.listBusinessesDueForDigest();
  for (const b of businesses) {
    try {
      const ownerEmail = await db.getBusinessOwnerEmail(b.id);
      if (!ownerEmail) {
        await db.markDigestSent(b.id); // nothing to send to - don't retry every scan forever
        continue;
      }
      const data = await db.getDailyDigestData(b.id);
      await email.sendEmail({
        to: ownerEmail,
        subject: `Your SellersPoint digest - ${data.business.businessName}`,
        html: email.dailyDigestEmailHtml({
          businessName: data.business.businessName,
          currency: data.business.currency,
          todayRevenue: data.todayRevenue,
          todayOrders: data.todayOrders,
          todayNewCustomers: data.todayNewCustomers,
          lowStock: data.lowStock,
          pendingCount: data.pendingCount,
          pl: data.pl,
          unsubscribeUrl: `${APP_BASE_URL}/api/digest/unsubscribe/${b.id}`,
        }),
      });
      await db.markDigestSent(b.id);
    } catch (err) {
      console.error(`[scheduler] daily digest failed for business ${b.id}:`, err.message);
    }
  }
}

// Warns a trial business a few days before it lapses into Starter, rather
// than letting effectivePlan()'s silent revert (server/db.js) be the only
// signal - see server/pricing.js's TRIAL_DAYS comment for why no separate
// job is needed to actually end the trial, only to warn about it first.
async function runTrialReminderScan() {
  if (!email.isConfigured()) return;
  const businesses = await db.listTrialsEndingSoon();
  for (const b of businesses) {
    try {
      const claimed = await db.markTrialReminderSent(b.id);
      if (!claimed) continue; // another scan already sent this one
      const ownerEmail = await db.getBusinessOwnerEmail(b.id);
      if (!ownerEmail) continue;
      await email.sendEmail({
        to: ownerEmail,
        subject: `Your SellersPoint free trial ends soon - ${b.businessName}`,
        html: email.trialEndingEmailHtml({ businessName: b.businessName }),
      });
    } catch (err) {
      console.error(`[scheduler] trial reminder failed for business ${b.id}:`, err.message);
    }
  }
}

async function runScheduledJobs() {
  await runAutoReminderScan();
  await runRecurringCampaignScan();
  await runDailyDigestScan();
  await runTrialReminderScan();
}

function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === "true") return; // kill switch for local dev / incident rollback
  runScheduledJobs().catch((err) => console.error("[scheduler] initial run failed:", err.message));
  setInterval(() => runScheduledJobs().catch((err) => console.error("[scheduler] scan failed:", err.message)), SCAN_INTERVAL_MS);
}

module.exports = { startScheduler, runAutoReminderScan, runRecurringCampaignScan, runDailyDigestScan, runTrialReminderScan };
