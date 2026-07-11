const crypto = require("node:crypto");
const db = require("./db");

// The 10-question Business Readiness Assessment lives client-side
// (founding-members.js) since it needs no persistence to run - the score
// is just carried along as a field on the signup payload if the visitor
// takes the assessment before joining.

// Drip sequence subjects, mirrors the CLAUDE.md-documented plan. Sequence 1
// (Welcome) is sent synchronously at signup via email.js; 2-6 are enqueued
// here for a future scheduled dispatcher (not built yet).
const DRIP_SEQUENCE = [
  { sequence: 2, subject: "The SellersPoint founder's story", days: 2 },
  { sequence: 3, subject: "A sneak peek at your new dashboard", days: 5 },
  { sequence: 4, subject: "3 tips to run a smarter business today", days: 9 },
  { sequence: 5, subject: "Founding Member launch countdown", days: 14 },
  { sequence: 6, subject: "Your early access invitation", days: 21 },
];

function toWaitlistJson(row) {
  return {
    id: row.id,
    businessName: row.business_name,
    ownerName: row.owner_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    businessCategory: row.business_category,
    businessSize: row.business_size,
    challenge: row.challenge,
    readinessScore: row.readiness_score,
    referralCode: row.referral_code,
    referredBy: row.referred_by,
    createdAt: row.created_at,
  };
}

function generateReferralCode() {
  // 6 base32-ish uppercase chars - short enough to read out loud/type from
  // a shared link, long enough that collisions are rare (retried below anyway).
  return crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
}

async function createSignup(data) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) throw new db.OrderError("Email is required");
  if (!data.businessName) throw new db.OrderError("Business name is required");
  if (!data.ownerName) throw new db.OrderError("Owner name is required");

  const { rows: existing } = await db.query("SELECT * FROM waitlist_signups WHERE email = $1", [email]);
  if (existing[0]) return { signup: toWaitlistJson(existing[0]), alreadyJoined: true };

  const score = Number.isFinite(Number(data.readinessScore)) ? Math.max(0, Math.min(100, Number(data.readinessScore))) : null;

  let row;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const referralCode = generateReferralCode();
    try {
      const { rows } = await db.query(
        `INSERT INTO waitlist_signups
           (business_name, owner_name, email, phone, country, business_category, business_size, challenge, readiness_score, referral_code, referred_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          data.businessName,
          data.ownerName,
          email,
          data.phone || "",
          data.country || "",
          data.businessCategory || "",
          data.businessSize || "",
          data.challenge || "",
          score,
          referralCode,
          data.referredBy || null,
        ]
      );
      row = rows[0];
    } catch (err) {
      if (err.code === "23505" && err.constraint === "waitlist_signups_referral_code_key") continue; // retry on collision
      throw err;
    }
  }
  if (!row) throw new Error("Could not allocate a referral code, please try again");

  await enqueueDripSequence(row.id);
  return { signup: toWaitlistJson(row), alreadyJoined: false };
}

async function enqueueDripSequence(signupId) {
  const now = Date.now();
  for (const step of DRIP_SEQUENCE) {
    const sendAt = new Date(now + step.days * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO waitlist_email_queue (signup_id, sequence, subject, send_at) VALUES ($1,$2,$3,$4)`,
      [signupId, step.sequence, step.subject, sendAt]
    );
  }
}

async function getStats() {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total, COUNT(DISTINCT NULLIF(country, ''))::int AS countries FROM waitlist_signups`
  );
  return { businesses: rows[0].total, countries: rows[0].countries };
}

module.exports = { createSignup, getStats };
