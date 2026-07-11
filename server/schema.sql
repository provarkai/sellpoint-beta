-- SellersPoint multi-tenant schema (Postgres / Supabase).
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Your Business',
  phone text not null default '',
  logo text not null default '',
  address text not null default '',
  payment_provider text not null default 'Manual bank transfer',
  payment_link text not null default '',
  payment_details text not null default '',
  plan text not null default 'starter',
  billing_cycle text not null default 'monthly',
  plan_expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table businesses add column if not exists address text not null default '';

-- Public storefront (Growth plan and above - see pricing.js#storefrontEnabledFor).
-- slug is the shareable URL segment (/store/<slug>); storefront_enabled is a
-- seller-controlled switch so a business isn't publicly visible before
-- they've built out their catalog, even once they're on an eligible plan.
alter table businesses add column if not exists slug text;
alter table businesses add column if not exists storefront_enabled boolean not null default false;
update businesses set slug = 'shop-' || substr(id::text, 1, 8) where slug is null;
alter table businesses alter column slug set not null;
create unique index if not exists businesses_slug_idx on businesses(lower(slug));
-- Storefront branding: banner image (base64, same pattern as logo/product
-- photos) and a small fixed set of social links shown on the public page.
alter table businesses add column if not exists storefront_banner text not null default '';
alter table businesses add column if not exists social_links jsonb not null default '{}'::jsonb;

-- Logistics: dispatch/courier provider credentials the seller has entered.
-- Deliberately generic (name + tracking API base + API key) rather than
-- per-carrier integrations - no specific dispatch rider API is wired up
-- yet, this just gives sellers a place to store the details until one is.
create table if not exists logistics_providers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  api_key text not null default '',
  api_base text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists logistics_providers_business_id_idx on logistics_providers(business_id);

-- One row per (Supabase Auth user, business). user_id is unique for now since
-- a user belongs to exactly one business (owner or staff) - multi-business
-- membership can relax this later without changing the table shape.
create table if not exists business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);
create index if not exists business_members_business_id_idx on business_members(business_id);

-- Schema evolution: email column added after business_members already had
-- rows in it. ADD COLUMN IF NOT EXISTS + a one-time backfill from
-- auth.users keeps this safe to re-run on a fresh database too (both
-- become no-ops once the column exists and is populated).
alter table business_members add column if not exists email text not null default '';
update business_members m set email = u.email
  from auth.users u where u.id = m.user_id and m.email = '';

-- Pending staff invites, keyed by email since the invitee may not have a
-- Supabase account yet. Consumed (and deleted) when someone signs in with a
-- matching email and has no existing business membership - see
-- db.js#createBusiness.
create table if not exists business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique(business_id, email)
);
create index if not exists business_invites_email_idx on business_invites(lower(email));

-- One named location per business. Deliberately lightweight today: a
-- label + address only, not yet a scoping key on products/orders/inventory -
-- see CLAUDE_HANDOFF.md for what a real multi-branch data model would need.
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  address text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists branches_business_id_idx on branches(business_id);

-- Monthly AI Tools generation counter per business, used to enforce
-- pricing.aiLimit. "month" is a plain 'YYYY-MM' string (UTC) rather than a
-- date range query, since it's simpler to reason about and index.
create table if not exists ai_usage (
  business_id uuid not null references businesses(id) on delete cascade,
  month text not null,
  count integer not null default 0,
  primary key (business_id, month)
);

-- Standalone free "Receipt Generator" lead-magnet tool (not tied to
-- orders/products) - counted separately against pricing.receiptLimit.
create table if not exists receipt_usage (
  business_id uuid not null references businesses(id) on delete cascade,
  month text not null,
  count integer not null default 0,
  primary key (business_id, month)
);

-- One row per a-la-carte add-on purchase (see server/index.js
-- /api/addons/purchase). "ai_credits" rows carry a month (the bonus applies
-- to that calendar month only); "staff"/"branch" rows leave month null
-- (a purchased seat/branch is permanent, not monthly).
create table if not exists addon_purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null check (type in ('ai_credits', 'staff', 'branch')),
  month text,
  created_at timestamptz not null default now()
);
create index if not exists addon_purchases_business_id_idx on addon_purchases(business_id);

create table if not exists products (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  price numeric not null default 0,
  stock integer not null default 0,
  category text not null default '',
  type text not null default 'Product',
  delivery_link text not null default '',
  delivery_note text not null default '',
  image text not null default '',
  images jsonb not null default '[]'::jsonb,
  description text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists products_business_id_idx on products(business_id);
alter table products add column if not exists image text not null default '';
alter table products add column if not exists description text not null default '';
-- images is a jsonb array of up to 5 base64 photos (same pattern as logo/
-- banner) - image (singular) stays in sync as images[0] for anything still
-- reading the old field (e.g. cached storefront responses, the item list
-- thumbnail).
alter table products add column if not exists images jsonb not null default '[]'::jsonb;
-- Nullable: no discount unless explicitly set. Stored as the discounted
-- price itself (not a percentage) so display/order math is one comparison
-- ("is discount_price set and lower than price?") instead of recomputing a
-- percentage everywhere it's used.
alter table products add column if not exists discount_price numeric;

create table if not exists customers (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  location text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists customers_business_id_idx on customers(business_id);
alter table customers add column if not exists email text not null default '';

create table if not exists orders (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  product_id text,
  product_name text not null default '',
  product_type text not null default 'Product',
  customer_id text,
  qty integer not null default 1,
  price numeric not null default 0,
  status text not null default 'Pending payment',
  created_at timestamptz not null default now(),
  delivered boolean not null default false,
  delivery_method text not null default 'self'
);
create index if not exists orders_business_id_idx on orders(business_id);
alter table orders add column if not exists delivery_method text not null default 'self';

create table if not exists events (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null,
  detail text not null default '',
  at timestamptz not null default now()
);
create index if not exists events_business_id_idx on events(business_id);

create table if not exists payments (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null,
  reference text not null unique,
  plan text not null,
  billing_cycle text not null,
  amount numeric not null,
  status text not null,
  raw_payload text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists payments_business_id_idx on payments(business_id);

-- Genuine singleton: SellersPoint's own payout details shown on upgrade.html,
-- not per-tenant. Edited only from the platform-admin backend.
create table if not exists owner_payment (
  id integer primary key check (id = 1),
  name text not null default 'SellersPoint',
  provider text not null default 'Paystack',
  link text not null default '',
  details text not null default ''
);
insert into owner_payment (id) values (1) on conflict (id) do nothing;

-- Platform-wide feature toggles, editable only from the platform-admin
-- backend. Kept separate from owner_payment since it's a different concern
-- (feature flags vs. payout details), even though both are singletons.
-- pricing_overrides holds admin-edited monthly prices, e.g.
-- {"growth": 6000, "pro": 15000} - keys not present fall back to
-- server/pricing.js's hardcoded defaults (see pricing.js#applyOverrides).
create table if not exists platform_settings (
  id integer primary key check (id = 1),
  extended_pricing_enabled boolean not null default false,
  pricing_overrides jsonb not null default '{}'::jsonb
);
insert into platform_settings (id) values (1) on conflict (id) do nothing;
alter table platform_settings add column if not exists pricing_overrides jsonb not null default '{}'::jsonb;
-- Platform-wide social media links shown as icons in the public landing
-- page footer, editable only from the platform-admin backend.
alter table platform_settings add column if not exists social_links jsonb not null default '{}'::jsonb;

-- Seller-written "Why buy from us" bullets (one per line) shown on the
-- storefront - the seller's own claims about themselves, not numbers the
-- app invents.
alter table businesses add column if not exists why_buy_text text not null default '';

-- Seller online payments (Paystack subaccounts) - entirely optional, off by
-- default. payment_mode 'manual' is the existing WhatsApp + bank transfer
-- flow (via payment_details above); 'paystack' means storefront customers
-- can pay online directly into the seller's own subaccount. absorb_fees
-- controls who covers Paystack's transaction fee: true = seller absorbs it
-- from their payout, false = it's added to what the customer pays.
alter table businesses add column if not exists payment_mode text not null default 'manual';
alter table businesses add column if not exists absorb_fees boolean not null default false;
alter table businesses add column if not exists paystack_subaccount_code text not null default '';
alter table businesses add column if not exists paystack_bank_code text not null default '';
alter table businesses add column if not exists paystack_bank_name text not null default '';
alter table businesses add column if not exists paystack_account_number text not null default '';
alter table businesses add column if not exists paystack_account_name text not null default '';

-- Founding Members waitlist (pre-launch growth capture) --------------------
-- Deliberately separate from `businesses`/auth - this is a marketing lead
-- capture, not an account. The product already has a working self-serve
-- signup (signup.html); registering here doesn't create a login, it just
-- reserves a spot and a referral code. referral_code is this entrant's own
-- shareable code; referred_by_code is whoever's link they came in on (both
-- text, not a self-FK, since the referrer may not exist yet when a link is
-- shared before its owner's row does).
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  owner_name text not null,
  email text not null,
  phone text not null default '',
  country text not null default '',
  state text not null default '',
  business_category text not null default '',
  business_size text not null default '',
  years_in_business text not null default '',
  current_challenges text not null default '',
  referral_code text not null unique,
  referred_by_code text not null default '',
  newsletter_opt_in boolean not null default false,
  readiness_score integer,
  created_at timestamptz not null default now()
);
create index if not exists waitlist_email_idx on waitlist(lower(email));
create index if not exists waitlist_referral_code_idx on waitlist(referral_code);
-- Score from the landing page's inline Business Readiness Assessment,
-- captured alongside signup when a visitor completes it first. CREATE TABLE
-- IF NOT EXISTS above is a no-op once the table already exists, so this
-- column needs its own idempotent ALTER like every other schema addition.
alter table waitlist add column if not exists readiness_score integer;

-- Row Level Security -------------------------------------------------------
-- The server only ever talks to Postgres directly via DATABASE_URL as the
-- `postgres` role (see server/db.js), which bypasses RLS entirely - so this
-- costs the app nothing. But Supabase also exposes every `public` table
-- through PostgREST using the public anon key that ships in the frontend
-- (supabase-init.js), and PostgREST ignores our Express-level business_id
-- scoping completely. With RLS off, anyone holding that anon key could
-- query e.g. GET .../rest/v1/businesses?select=* directly and read every
-- tenant's data. Enabling RLS with zero policies denies all PostgREST
-- access for anon/authenticated by default, closing that gap, while leaving
-- the app's own data access (all of which goes through the Express API,
-- never PostgREST) completely unaffected.
alter table businesses enable row level security;
alter table logistics_providers enable row level security;
alter table business_members enable row level security;
alter table business_invites enable row level security;
alter table branches enable row level security;
alter table ai_usage enable row level security;
alter table receipt_usage enable row level security;
alter table addon_purchases enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table events enable row level security;
alter table payments enable row level security;
alter table owner_payment enable row level security;
alter table platform_settings enable row level security;
alter table waitlist enable row level security;
