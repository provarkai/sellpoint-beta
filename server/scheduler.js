// AI Automation (Slice Three item 3): proactive payment reminders. No cron
// infra exists anywhere in this codebase, and the app runs as one persistent
// Node process (Railway) - so a plain setInterval-based scan is enough;
// adding node-cron for "scan a few times a day" goes against this
// codebase's consistently minimal-dependency style (see validate.js's
// explicit "kept dependency-free" comment).
const db = require("./db");
const whatsapp = require("./whatsapp");

const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 4x/day; isOrderDueForAutoReminder's
// own date math (not wall-clock alignment) is what prevents duplicate sends,
// so polling more often than once/day is safe.

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

async function runScheduledJobs() {
  await runAutoReminderScan();
  await runRecurringCampaignScan();
}

function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === "true") return; // kill switch for local dev / incident rollback
  runScheduledJobs().catch((err) => console.error("[scheduler] initial run failed:", err.message));
  setInterval(() => runScheduledJobs().catch((err) => console.error("[scheduler] scan failed:", err.message)), SCAN_INTERVAL_MS);
}

module.exports = { startScheduler, runAutoReminderScan, runRecurringCampaignScan };
