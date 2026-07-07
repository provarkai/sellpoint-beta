# Hosting SellersPoint

SellersPoint is a Node/Express server backed by Postgres (via Supabase) - it is
**not** static HTML anymore. Static-site hosts (Netlify/Vercel/GitHub Pages
drag-and-drop, etc.) can't run the `/api/*` server, so they're not an option
here; you need a host that runs a persistent Node process. Postgres and Auth
already live on Supabase regardless of where the Node app itself runs.

## Recommended: Railway (or Render)
Both run `npm start` as a long-lived process with free HTTPS on a custom
domain and simple env-var secrets - the least setup for a small SaaS.

1. Push this repo to GitHub.
2. Create a new Railway project from the repo (or Render "Web Service").
3. Set the start command to `npm start` (already the `package.json` default).
4. Add environment variables (see `.env.example`): `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
   `PLATFORM_ADMIN_EMAILS`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`.
5. Run `npm run migrate` once against the deployed environment (Railway/Render
   both let you run a one-off command against the same env vars) to apply
   `server/schema.sql`.
6. Once the deploy has a public HTTPS URL, register
   `https://<your-domain>/api/payments/webhook` in the Paystack dashboard so
   plan activation doesn't depend on a seller's browser staying open through
   checkout (see `CLAUDE_HANDOFF.md`).

Because all state now lives in Supabase Postgres rather than a local SQLite
file, the Node app itself is stateless - you can run more than one instance
behind the host's load balancer if traffic grows, with no extra work.

## Alternative: a plain VPS
A DigitalOcean/Linode droplet is cheaper long-term but means you manage the
OS, a process manager (e.g. `pm2` or a systemd unit), and TLS (e.g. via
Caddy or an nginx + Let's Encrypt setup) yourself. Worth it once you outgrow
a managed host's pricing, not before.

## Supabase Project Region
Pick the Supabase region closest to your primary users when you create the
project - there's no African region yet, so for Nigeria-based users the
lowest-latency options today are the EU regions (Frankfurt/London). This is a
project-creation-time choice; revisit only if latency from other regions
becomes a real problem once you have users elsewhere.

## Production Warning
Real payment confirmation must happen server-side via the Paystack webhook or
the verify-by-reference fallback (see `CLAUDE_HANDOFF.md`) - never trust a
client-reported "I paid" status for activating a plan.
