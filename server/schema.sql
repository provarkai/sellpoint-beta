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
  created_at timestamptz not null default now()
);
create index if not exists products_business_id_idx on products(business_id);

create table if not exists customers (
  id text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text not null default '',
  location text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists customers_business_id_idx on customers(business_id);

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
  delivered boolean not null default false
);
create index if not exists orders_business_id_idx on orders(business_id);

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
  provider text not null default 'Manual bank transfer',
  link text not null default '',
  details text not null default ''
);
insert into owner_payment (id) values (1) on conflict (id) do nothing;

-- Platform-wide feature toggles, editable only from the platform-admin
-- backend. Kept separate from owner_payment since it's a different concern
-- (feature flags vs. payout details), even though both are singletons.
create table if not exists platform_settings (
  id integer primary key check (id = 1),
  extended_pricing_enabled boolean not null default false
);
insert into platform_settings (id) values (1) on conflict (id) do nothing;
