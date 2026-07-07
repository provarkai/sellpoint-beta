// Pure input-validation helpers shared by server/db.js. Kept dependency-free
// (no pg import) so they can be unit-tested without a live database.

class ValidationError extends Error {}

function requireString(value, field) {
  const str = typeof value === "string" ? value.trim() : "";
  if (!str) throw new ValidationError(`${field} is required`);
  return str;
}

function requireNumber(value, field, { min, max, integer = false } = {}) {
  // Number(null) is 0 and Number([]) is 0 - reject anything that isn't
  // already a number or a numeric string instead of silently coercing
  // null/booleans/arrays into a valid-looking 0.
  if (typeof value !== "number" && typeof value !== "string") {
    throw new ValidationError(`${field} must be a number`);
  }
  if (value === "") throw new ValidationError(`${field} is required`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number`);
  if (integer && !Number.isInteger(n)) throw new ValidationError(`${field} must be a whole number`);
  if (min !== undefined && n < min) throw new ValidationError(`${field} must be at least ${min}`);
  if (max !== undefined && n > max) throw new ValidationError(`${field} must be at most ${max}`);
  return n;
}

module.exports = { ValidationError, requireString, requireNumber };
