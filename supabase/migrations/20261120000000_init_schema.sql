-- =============================================================================
-- W2P web-to-print platform — initial schema (Phase 1)
--
-- Replaces the earlier draft schema (src/lib/supabase/schema.sql) and the three
-- 20261119_* migrations, none of which were ever applied to the project.
--
-- Access model
--   * The Next.js server talks to Postgres with the service-role key and enforces
--     ownership/role rules in its service layer (see src/server/**).
--   * Row-level security is ENABLED on every table as defence in depth. The only
--     policies granted to the anon/authenticated roles are read access to the
--     active catalogue, so a leaked publishable key can read nothing else.
--
-- Money is stored in integer paise (INR minor units). GST is split into
-- CGST/SGST (intra-state, seller in Delhi = state code 07) or IGST (inter-state).
--
-- Idempotent: safe to run more than once.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('customer', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.draft_status as enum
    ('configured', 'artwork_ready', 'proof_pending', 'proof_approved', 'payment_pending', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.proof_status as enum ('pending_review', 'approved', 'changes_requested', 'superseded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pipeline_stage as enum ('QUOTE', 'ORDER', 'ARTWORK', 'PROOF', 'PRODUCTION', 'COMPLETED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null unique,
  full_name     text,
  company_name  text,
  phone         text,
  gstin         text,
  state_code    text,                       -- GST state code of the customer, e.g. '07' (Delhi)
  role          public.user_role not null default 'customer',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new auth user gets a CUSTOMER profile. Roles are never taken from
-- user-supplied metadata; admins are promoted explicitly (see seed script).
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, company_name, phone)
  values (
    new.id,
    lower(new.email),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'company_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin' and is_active);
$$;

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------
create table if not exists public.divisions (
  id            text primary key,
  slug          text not null unique,
  name          text not null,
  tagline       text not null default '',
  description   text not null default '',
  icon          text not null default '',
  accent_color  text not null default '#000000',
  banner_image  text,
  is_active     boolean not null default true,
  order_index   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists divisions_updated_at on public.divisions;
create trigger divisions_updated_at before update on public.divisions
  for each row execute function public.set_updated_at();

create table if not exists public.products (
  id                         text primary key,
  division_id                text not null references public.divisions (id) on delete restrict,
  slug                       text not null unique,
  name                       text not null,
  subtitle                   text not null default '',
  description                text not null default '',
  base_price_paise           int not null check (base_price_paise >= 0),
  price_per_sq_cm_paise      numeric(10, 2) not null check (price_per_sq_cm_paise >= 0),
  gst_rate                   numeric(5, 2) not null default 18 check (gst_rate between 0 and 28),
  hsn_code                   text,
  min_width_mm               int not null check (min_width_mm > 0),
  max_width_mm               int not null,
  min_height_mm              int not null check (min_height_mm > 0),
  max_height_mm              int not null,
  default_width_mm           int not null,
  default_height_mm          int not null,
  default_bleed_mm           numeric(5, 2) not null default 3,
  default_safety_margin_mm   numeric(5, 2) not null default 3,
  allowed_materials          jsonb not null default '[]'::jsonb,
  allowed_orientations       jsonb not null default '["portrait","landscape","square"]'::jsonb,
  pricing_tiers              jsonb not null default '[]'::jsonb,
  has_variable_data          boolean not null default false,
  variable_data_sample_headers jsonb,
  image_url                  text,
  is_active                  boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (max_width_mm >= min_width_mm),
  check (max_height_mm >= min_height_mm)
);

create index if not exists products_division_idx on public.products (division_id);

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Job drafts (configured job → artwork → proof → approval → payment)
-- -----------------------------------------------------------------------------
create table if not exists public.drafts (
  id                 uuid primary key default gen_random_uuid(),
  product_id         text not null references public.products (id),
  customer_id        uuid references public.profiles (id) on delete set null,
  customer_email     text,
  -- Secret held in an http-only cookie so an anonymous visitor can keep working
  -- on their own draft until they sign in. Never returned to the client in JSON.
  guest_token_hash   text,
  status             public.draft_status not null default 'configured',
  options            jsonb not null,              -- widthMm, heightMm, materialId, orientation, bleedMm, safetyMarginMm
  quantity           int not null check (quantity > 0),
  design_json        jsonb,
  uploaded_file_path text,
  csv_file_path      text,
  proof_version      int not null default 1,
  order_id           uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists drafts_customer_idx on public.drafts (customer_id);

drop trigger if exists drafts_updated_at on public.drafts;
create trigger drafts_updated_at before update on public.drafts
  for each row execute function public.set_updated_at();

create table if not exists public.draft_proofs (
  id                uuid primary key default gen_random_uuid(),
  draft_id          uuid not null references public.drafts (id) on delete cascade,
  version           int not null check (version > 0),
  status            public.proof_status not null default 'pending_review',
  rendered_url      text not null default '',
  sha256            text not null default '',
  feedback          text,
  approved_by       uuid references public.profiles (id),
  approved_by_email text,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (draft_id, version)
);

create table if not exists public.draft_events (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid not null references public.drafts (id) on delete cascade,
  actor_id     text not null,
  actor_email  text not null,
  from_status  public.draft_status,
  to_status    public.draft_status,
  action       text not null,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists draft_events_draft_idx on public.draft_events (draft_id, created_at);

-- -----------------------------------------------------------------------------
-- Orders
-- -----------------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1001;

-- W2P-<year>-<6 digit sequence>; unique, gap-tolerant, never random.
create or replace function public.next_order_number()
returns text language sql volatile as $$
  select 'W2P-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;

create table if not exists public.orders (
  id                        uuid primary key default gen_random_uuid(),
  order_number              text not null unique default public.next_order_number(),
  customer_id               uuid not null references public.profiles (id) on delete restrict,
  customer_email            text not null,
  customer_name             text not null,
  customer_gstin            text,
  draft_id                  uuid references public.drafts (id) on delete set null,
  division_slug             text,
  pipeline_stage            public.pipeline_stage not null default 'ORDER',
  payment_status            public.payment_status not null default 'pending',
  currency                  text not null default 'INR',
  subtotal_paise            int not null check (subtotal_paise >= 0),
  cgst_paise                int not null default 0,
  sgst_paise                int not null default 0,
  igst_paise                int not null default 0,
  tax_paise                 int not null check (tax_paise >= 0),
  total_paise               int not null check (total_paise >= 0),
  place_of_supply           text,                       -- GST state code of the delivery address
  shipping_address          jsonb not null,
  approved_proof_version    int,
  approved_proof_sha256     text,
  stripe_session_id         text unique,
  stripe_payment_intent_id  text,
  xero_invoice              jsonb,
  notes                     text,
  archived_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (total_paise = subtotal_paise + tax_paise),
  check (tax_paise = cgst_paise + sgst_paise + igst_paise)
);

create index if not exists orders_customer_idx on public.orders (customer_id, created_at desc);
create index if not exists orders_stage_idx on public.orders (pipeline_stage);
create index if not exists orders_payment_idx on public.orders (payment_status);
create index if not exists orders_created_idx on public.orders (created_at desc);

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.drafts
  drop constraint if exists drafts_order_fk,
  add constraint drafts_order_fk foreign key (order_id) references public.orders (id) on delete set null;

create table if not exists public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  product_id          text references public.products (id) on delete set null,
  product_name        text not null,
  division_slug       text not null,
  hsn_code            text,
  width_mm            numeric(8, 2) not null,
  height_mm           numeric(8, 2) not null,
  material_id         text not null,
  material_name       text not null,
  quantity            int not null check (quantity > 0),
  unit_price_paise    int not null check (unit_price_paise >= 0),
  line_subtotal_paise int not null check (line_subtotal_paise >= 0),
  gst_rate            numeric(5, 2) not null,
  artwork_type        text not null check (artwork_type in ('designer', 'upload')),
  design_json         jsonb,
  uploaded_file_path  text,
  created_at          timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_stage  public.pipeline_stage,
  to_stage    public.pipeline_stage not null,
  changed_by  text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

create table if not exists public.production_files (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  kind          text not null check (kind in ('pdf', 'png', 'csv_zip')),
  file_name     text not null,
  storage_path  text not null,
  size_bytes    bigint,
  dpi           int not null default 300,
  bleed_mm      numeric(5, 2) not null default 3,
  created_at    timestamptz not null default now()
);

create index if not exists production_files_order_idx on public.production_files (order_id);

-- -----------------------------------------------------------------------------
-- Saved designs
-- -----------------------------------------------------------------------------
create table if not exists public.saved_designs (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.profiles (id) on delete cascade,
  product_id    text not null references public.products (id),
  name          text not null,
  width_mm      numeric(8, 2) not null,
  height_mm     numeric(8, 2) not null,
  material_id   text not null,
  canvas_state  jsonb not null,
  preview_url   text,
  source_order_id uuid references public.orders (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists saved_designs_customer_idx on public.saved_designs (customer_id, created_at desc);

drop trigger if exists saved_designs_updated_at on public.saved_designs;
create trigger saved_designs_updated_at before update on public.saved_designs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Email log (exactly-once notifications) and admin audit log
-- -----------------------------------------------------------------------------
create table if not exists public.email_logs (
  id                  uuid primary key default gen_random_uuid(),
  idempotency_key     text not null,
  order_ref           text not null,               -- order id or draft id the email is about
  event               text not null,
  recipient           text not null,
  recipient_name      text not null default '',
  subject             text not null,
  body_text           text not null,
  body_html           text not null,
  status              text not null check (status in ('sent', 'failed', 'skipped_duplicate')),
  provider            text not null,
  provider_message_id text,
  error               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Exactly-once: at most one SENT email per idempotency key (failed/skipped attempts may repeat).
create unique index if not exists email_logs_sent_once_idx on public.email_logs (idempotency_key) where status = 'sent';
create index if not exists email_logs_order_idx on public.email_logs (order_ref);
create index if not exists email_logs_created_idx on public.email_logs (created_at desc);

create table if not exists public.admin_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.profiles (id) on delete set null,
  admin_email  text not null,
  action       text not null,
  target_type  text not null,
  target_id    text not null,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_target_idx on public.admin_audit_logs (target_type, target_id);

-- -----------------------------------------------------------------------------
-- Row-level security: on everywhere; only the active catalogue is publicly readable.
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.divisions         enable row level security;
alter table public.products          enable row level security;
alter table public.drafts            enable row level security;
alter table public.draft_proofs      enable row level security;
alter table public.draft_events      enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.order_events      enable row level security;
alter table public.production_files  enable row level security;
alter table public.saved_designs     enable row level security;
alter table public.email_logs        enable row level security;
alter table public.admin_audit_logs  enable row level security;

drop policy if exists "Active divisions are public" on public.divisions;
create policy "Active divisions are public" on public.divisions
  for select to anon, authenticated using (is_active);

drop policy if exists "Active products are public" on public.products;
create policy "Active products are public" on public.products
  for select to anon, authenticated using (is_active);

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

-- Make the new tables visible to the API immediately.
notify pgrst, 'reload schema';
