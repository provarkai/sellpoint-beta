-- SellPoint multi-tenant schema (Postgres / Supabase).
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Your Business',
  phone text not null default '',
  logo text not null default '',
  payment_provider text not null default 'Manual bank transfer',
  payment_link text not null default '',
  payment_details text not null default '',
  plan text not null default 'starter',
  billing_cycle text not null default 'monthly',
  plan_expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per (Supabase Auth user, business). user_id is unique for now since
-- a user belongs to exactly one business (owner) - staff/multi-business
-- membership can relax this later without changing the table shape.
create table if not exists business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);
create index if not exists business_members_business_id_idx on business_members(business_id);

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

-- Genuine singleton: SellPoint's own payout details shown on upgrade.html,
-- not per-tenant. Edited only from the platform-admin backend.
create table if not exists owner_payment (
  id integer primary key check (id = 1),
  name text not null default 'SellPoint',
  provider text not null default 'Manual bank transfer',
  link text not null default '',
  details text not null default ''
);
insert into owner_payment (id) values (1) on conflict (id) do nothing;

-- Founding Members waitlist (founding-members.html) - pre-launch signups,
-- separate from the real `businesses` tenants created via signup.html.
-- referral_code is short/shareable by design (not the long uid() ids used
-- elsewhere), referred_by is unenforced text (not a FK) since a signup can
-- be referred by a code that hasn't been created yet in a race, and we'd
-- rather keep the row than reject the signup.
create table if not exists waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  owner_name text not null,
  email text not null unique,
  phone text not null default '',
  country text not null default '',
  business_category text not null default '',
  business_size text not null default '',
  challenge text not null default '',
  readiness_score integer,
  referral_code text not null unique,
  referred_by text,
  created_at timestamptz not null default now()
);
create index if not exists waitlist_signups_country_idx on waitlist_signups(country);

-- Scaffold for the founder's-story/product-sneak-peek/etc drip sequence.
-- Rows are enqueued at signup time; sent_at stays null until a future
-- scheduled dispatcher sends them (not built yet - see CLAUDE_HANDOFF.md).
create table if not exists waitlist_email_queue (
  id uuid primary key default gen_random_uuid(),
  signup_id uuid not null references waitlist_signups(id) on delete cascade,
  sequence integer not null,
  subject text not null,
  send_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists waitlist_email_queue_due_idx on waitlist_email_queue(send_at) where sent_at is null;
