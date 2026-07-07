const { createClient } = require("@supabase/supabase-js");
const db = require("./db");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Verifying via supabaseAdmin.auth.getUser() (a call to Supabase) rather than
// hand-rolling JWT/JWKS verification stays correct across any signing-key
// rotation Supabase does on their end, at the cost of one network round trip
// per request - an acceptable trade for a beta.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PLATFORM_ADMIN_EMAILS = (process.env.PLATFORM_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function getBearerUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function requireAuthOnly(req, res, next) {
  getBearerUser(req)
    .then((user) => {
      if (!user) return res.status(401).json({ error: "Authentication required" });
      req.user = user;
      next();
    })
    .catch(next);
}

function requireAuth(req, res, next) {
  getBearerUser(req)
    .then(async (user) => {
      if (!user) return res.status(401).json({ error: "Authentication required" });
      req.user = user;
      const membership = await db.getMembership(user.id);
      if (!membership) return res.status(403).json({ error: "No business associated with this account" });
      req.businessId = membership.businessId;
      req.role = membership.role;
      next();
    })
    .catch(next);
}

function requirePlatformAdmin(req, res, next) {
  getBearerUser(req)
    .then((user) => {
      if (!user) return res.status(401).json({ error: "Authentication required" });
      if (!PLATFORM_ADMIN_EMAILS.includes((user.email || "").toLowerCase())) {
        return res.status(403).json({ error: "Not authorized" });
      }
      req.user = user;
      next();
    })
    .catch(next);
}

module.exports = { requireAuthOnly, requireAuth, requirePlatformAdmin };
