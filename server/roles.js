// Single source of truth for staff permissions. Read by both
// server/auth.js's requirePermission middleware (server-side enforcement)
// and GET /api/me (so the frontend gets one `permissions` array instead of
// re-implementing this anywhere else).
//
// "owner" is checked separately (see requirePermission) and always passes,
// since it's one-per-business and the account that created/pays for the
// business.
//
// Permissions are custom per staff member (business_members.permissions,
// a text[] column - see server/db.js#inviteStaff/updateStaffPermissions)
// rather than derived from a fixed role. `role` still exists as a display
// label only: the matching preset name below if a member's permissions
// exactly equal one, otherwise 'custom' once the owner hand-edits away
// from a preset (see roleLabelForPermissions).
//
// Design principle ("best safety") - unchanged from the old fixed-role
// model: security/financial-account config (staff.manage, plan.manage,
// payments.manage) and the audit trail (audit.read) are owner-only,
// always - never assignable to any staff member no matter what the owner
// ticks, so a staff member can never be handed the ability to add other
// staff, change the bank account tied to payouts, or see who did what.
const ASSIGNABLE_PERMISSIONS = [
  { key: "products.write", label: "Products" },
  { key: "customers.write", label: "Customers" },
  { key: "orders.write", label: "Orders" },
  { key: "pos.use", label: "POS" },
  { key: "invoices.use", label: "Invoices" },
  { key: "expenses.write", label: "Expenses" },
  { key: "reports.read", label: "Reports" },
  { key: "suppliers.write", label: "Suppliers" },
  { key: "campaigns.send", label: "Campaigns" },
  { key: "coupons.manage", label: "Coupons" },
  { key: "logistics.manage", label: "Logistics" },
  { key: "settings.write", label: "Settings" },
];
const ASSIGNABLE_PERMISSION_KEYS = ASSIGNABLE_PERMISSIONS.map((p) => p.key);

const OWNER_ONLY_PERMISSIONS = ["staff.manage", "plan.manage", "payments.manage", "audit.read"];
const OWNER_ALL_PERMISSIONS = [...ASSIGNABLE_PERMISSION_KEYS, ...OWNER_ONLY_PERMISSIONS];

// Quick-fill presets for the invite form ("start from Manager, then
// customize") - purely a frontend convenience now, not the enforcement
// path. Values match what the fixed-role model granted before this
// migration, so picking a preset and saving without changes behaves
// identically to how it always did.
const PERMISSION_PRESETS = {
  manager: ["products.write", "customers.write", "orders.write", "pos.use", "invoices.use", "expenses.write", "reports.read", "suppliers.write", "campaigns.send", "coupons.manage", "logistics.manage", "settings.write"],
  sales_staff: ["customers.write", "orders.write", "pos.use", "invoices.use"],
  accountant: ["reports.read", "expenses.write", "invoices.use"],
};

const ROLE_LABELS = { owner: "Owner", manager: "Manager", sales_staff: "Sales Staff", accountant: "Accountant", custom: "Team Member" };
const INVITABLE_PRESET_KEYS = ["manager", "sales_staff", "accountant"];

function hasPermission(role, permissions, key) {
  if (role === "owner") return true;
  return Array.isArray(permissions) && permissions.includes(key);
}

// Never trust a client-supplied permissions array directly - strips
// anything outside ASSIGNABLE_PERMISSIONS (in particular the owner-only
// keys above) before it ever reaches the database.
function filterAssignablePermissions(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((p) => ASSIGNABLE_PERMISSION_KEYS.includes(p)))];
}

// Display-only: does this exact permission set match one of the named
// presets? Falls back to 'custom' the moment it doesn't.
function roleLabelForPermissions(permissions) {
  const sorted = [...(permissions || [])].sort().join(",");
  for (const [role, preset] of Object.entries(PERMISSION_PRESETS)) {
    if ([...preset].sort().join(",") === sorted) return role;
  }
  return "custom";
}

module.exports = {
  ASSIGNABLE_PERMISSIONS,
  ASSIGNABLE_PERMISSION_KEYS,
  OWNER_ONLY_PERMISSIONS,
  OWNER_ALL_PERMISSIONS,
  PERMISSION_PRESETS,
  ROLE_LABELS,
  INVITABLE_PRESET_KEYS,
  hasPermission,
  filterAssignablePermissions,
  roleLabelForPermissions,
};
