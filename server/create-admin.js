// One-off utility: node --env-file-if-exists=.env server/create-admin.js <email>
// Creates (or resets the password for) a Supabase Auth user for the given
// email, intended to be one of the addresses in PLATFORM_ADMIN_EMAILS so it
// can sign in at admin-login.html. Prints the generated password once - it
// is not stored anywhere, so save it immediately.
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const email = process.argv[2];
if (!email) {
  console.error("Usage: node server/create-admin.js <email>");
  process.exit(1);
}

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const password = crypto.randomBytes(9).toString("base64url");

async function main() {
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!createErr) {
    console.log("Admin account created.");
    console.log("  email:", email);
    console.log("  password:", password);
    return;
  }
  if (!/already been registered|already exists/i.test(createErr.message || "")) {
    throw createErr;
  }
  // Account already exists - reset its password instead of failing.
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (!existing) throw new Error("Could not find existing user to reset password for");
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
  if (updateErr) throw updateErr;
  console.log("Admin account already existed - password reset.");
  console.log("  email:", email);
  console.log("  password:", password);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
