// One-off schema setup: node server/migrate.js
// Safe to re-run - every statement in schema.sql is idempotent.
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set - copy .env.example to .env and fill in your Supabase connection string.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

pool
  .query(sql)
  .then(() => {
    console.log("Schema applied.");
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
