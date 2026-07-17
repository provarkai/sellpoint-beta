// Single source of truth for what each staff role can do. Read by both
// server/auth.js's requirePermission middleware (server-side enforcement)
// and GET /api/me (so the frontend gets one derived `permissions` array
// instead of re-implementing this matrix in app.js).
//
// "owner" isn't listed below - it's checked separately (see
// requirePermission) and always passes, since it's one-per-business and
// the account that created/pays for the business.
//
// Design principle ("best safety"): grant by what a role needs to do its
// job, not by what's convenient. Security/financial-account config
// (staff.manage, plan.manage, payments.manage) and the audit trail
// (audit.read) are owner-only regardless of role - a Manager can run the
// day-to-day business but can't add other staff, change the bank account
// tied to payouts, or see who did what.
const ROLE_PERMISSIONS = {
  manager: new Set([
    "products.write",
    "customers.write",
    "orders.write",
    "pos.use",
    "invoices.use",
    "expenses.write",
    "reports.read",
    "suppliers.write",
    "campaigns.send",
    "coupons.manage",
    "logistics.manage",
    "settings.write",
  ]),
  sales_staff: new Set(["customers.write", "orders.write", "pos.use", "invoices.use"]),
  accountant: new Set(["reports.read", "expenses.write", "invoices.use"]),
};

const ROLE_LABELS = { owner: "Owner", manager: "Manager", sales_staff: "Sales Staff", accountant: "Accountant" };
const INVITABLE_ROLES = ["manager", "sales_staff", "accountant"];

function hasPermission(role, key) {
  if (role === "owner") return true;
  return ROLE_PERMISSIONS[role]?.has(key) || false;
}

function permissionsFor(role) {
  if (role === "owner") {
    // Owner has every permission any role can have, plus the owner-only
    // ones (staff.manage/plan.manage/payments.manage/audit.read) that
    // aren't in ROLE_PERMISSIONS at all since no non-owner role ever gets
    // them - listed explicitly here so the frontend can gate on them too.
    const all = new Set(["staff.manage", "plan.manage", "payments.manage", "audit.read"]);
    Object.values(ROLE_PERMISSIONS).forEach((set) => set.forEach((p) => all.add(p)));
    return Array.from(all);
  }
  return Array.from(ROLE_PERMISSIONS[role] || []);
}

module.exports = { ROLE_PERMISSIONS, ROLE_LABELS, INVITABLE_ROLES, hasPermission, permissionsFor };
