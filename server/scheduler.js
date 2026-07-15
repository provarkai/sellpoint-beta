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

function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === "true") return; // kill switch for local dev / incident rollback
  runAutoReminderScan().catch((err) => console.error("[scheduler] initial run failed:", err.message));
  setInterval(() => runAutoReminderScan().catch((err) => console.error("[scheduler] scan failed:", err.message)), SCAN_INTERVAL_MS);
}

module.exports = { startScheduler, runAutoReminderScan };
