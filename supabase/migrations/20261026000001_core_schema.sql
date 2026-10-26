-- Just Clean — core schema
-- Laundry delivery marketplace (Saudi Arabia). All money in SAR, numeric(10,2).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.laundry_status as enum ('draft','submitted','under_review','approved','rejected','info_required');
create type public.fulfillment_method as enum ('pickup_delivery','pickup_only','delivery_only','dropoff');
create type public.order_status as enum (
  'placed','accepted','rejected',
  'pickup_assigned','picked_up','received','processing','ready',
  'return_assigned','out_for_delivery','delivered','completed','cancelled'
);
create type public.order_payment_status as enum ('unpaid','pending','paid','refunded','partially_refunded');
create type public.payment_method as enum ('cash','bank_transfer','online');
create type public.pricing_model as enum ('per_piece','per_kg','bundle','fixed','quote');
create type public.job_leg as enum ('pickup','return');
create type public.job_status as enum ('open','assigned','picked_up','delivered','failed','cancelled');
create type public.rider_status as enum ('pending','active','suspended','rejected');
create type public.subscription_status as enum ('pending','active','past_due','expired','suspended','cancelled');
create type public.payment_kind as enum ('partner_subscription','order','customer_package');
create type public.payment_record_status as enum ('pending','confirmed','failed','refunded');
create type public.customer_package_status as enum ('pending_payment','active','exhausted','expired','cancelled');
create type public.refund_status as enum ('pending','processed','rejected');
create type public.ticket_status as enum ('open','in_progress','resolved','closed');
create type public.app_locale as enum ('ar','ur');

-- ---------------------------------------------------------------------------
-- Platform settings (single row). Commercial rules live here, not in code.
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  partner_subscription_price numeric(10,2) not null default 100.00 check (partner_subscription_price >= 0),
  billing_cycle_months smallint not null default 1 check (billing_cycle_months between 1 and 12),
  trial_days smallint not null default 0 check (trial_days >= 0),
  grace_days smallint not null default 3 check (grace_days >= 0),
  require_active_subscription boolean not null default true,
  commission_enabled boolean not null default false,
  commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  order_accept_timeout_minutes smallint not null default 15 check (order_accept_timeout_minutes between 1 and 1440),
  default_service_radius_km numeric(6,2) not null default 10 check (default_service_radius_km > 0),
  max_search_radius_km numeric(6,2) not null default 30 check (max_search_radius_km > 0),
  rider_fee_per_leg numeric(10,2) not null default 0 check (rider_fee_per_leg >= 0),
  max_active_jobs_per_rider smallint not null default 3 check (max_active_jobs_per_rider >= 1),
  auto_complete_hours smallint not null default 48 check (auto_complete_hours >= 1),
  vat_rate numeric(5,2) not null default 15 check (vat_rate between 0 and 100),
  order_prefix text not null default 'JC' check (order_prefix ~ '^[A-Z]{1,5}$'),
  support_phone text,
  support_whatsapp text,
  bank_transfer_instructions text,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  locale public.app_locale not null default 'ar',
  is_admin boolean not null default false,
  notify_sms boolean not null default true,
  notify_push boolean not null default true,
  notify_marketing boolean not null default false,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
create table public.cities (
  id serial primary key,
  slug text not null unique,
  name_ar text not null,
  name_ur text not null,
  lat double precision not null,
  lng double precision not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.districts (
  id serial primary key,
  city_id int not null references public.cities(id) on delete cascade,
  name_ar text not null,
  name_ur text not null,
  lat double precision,
  lng double precision,
  is_active boolean not null default true,
  unique (city_id, name_ar)
);
create index on public.districts(city_id);

create table public.service_categories (
  id serial primary key,
  slug text not null unique,
  name_ar text not null,
  name_ur text not null,
  icon text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Laundries (one row = one registered location; subscription is per row)
-- ---------------------------------------------------------------------------
create table public.laundries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  name_en text,
  logo_path text,
  description text,
  representative_name text not null,
  phone text not null,
  email text,
  city_id int not null references public.cities(id),
  district_id int references public.districts(id),
  district_text text,
  address text not null,
  lat double precision not null check (lat between 16 and 33),
  lng double precision not null check (lng between 34 and 56),
  cr_number text,
  vat_number text,
  vat_registered boolean not null default false,
  opening_hours jsonb not null default '{}'::jsonb,
  service_radius_km numeric(6,2) not null default 5 check (service_radius_km > 0 and service_radius_km <= 50),
  supports_pickup boolean not null default true,
  supports_delivery boolean not null default true,
  supports_dropoff boolean not null default true,
  pickup_fee numeric(10,2) not null default 0 check (pickup_fee >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  min_order numeric(10,2) not null default 0 check (min_order >= 0),
  prep_hours int not null default 24 check (prep_hours between 1 and 720),
  accepting_orders boolean not null default true,
  status public.laundry_status not null default 'draft',
  is_active boolean not null default true,
  review_notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  terms_accepted_at timestamptz,
  settlement_bank_name text,
  settlement_iban text check (settlement_iban is null or settlement_iban ~ '^SA[0-9A-Z]{22}$'),
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.laundries(owner_id);
create index on public.laundries(city_id, status, is_active);
create index on public.laundries(lat, lng);

create table public.laundry_categories (
  laundry_id uuid references public.laundries(id) on delete cascade,
  category_id int references public.service_categories(id) on delete cascade,
  primary key (laundry_id, category_id)
);

create table public.laundry_documents (
  id uuid primary key default gen_random_uuid(),
  laundry_id uuid not null references public.laundries(id) on delete cascade,
  kind text not null check (kind in ('commercial_registration','municipal_license','vat_certificate','id_document','other')),
  storage_path text not null,
  file_name text,
  created_at timestamptz not null default now()
);
create index on public.laundry_documents(laundry_id);

-- ---------------------------------------------------------------------------
-- Service menu (each laundry sets its own prices)
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  laundry_id uuid not null references public.laundries(id) on delete cascade,
  category_id int not null references public.service_categories(id),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_ur text,
  description text,
  pricing_model public.pricing_model not null,
  price numeric(10,2) check (price is null or price >= 0),
  unit_label text,
  turnaround_hours int check (turnaround_hours is null or turnaround_hours between 1 and 720),
  restrictions text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_required check (pricing_model = 'quote' or price is not null)
);
create index on public.services(laundry_id, is_active);

-- ---------------------------------------------------------------------------
-- Customer data
-- ---------------------------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'home',
  city_id int not null references public.cities(id),
  district_id int references public.districts(id),
  district_text text,
  line text not null,
  lat double precision,
  lng double precision,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.addresses(user_id);

create table public.favorites (
  user_id uuid references public.profiles(id) on delete cascade,
  laundry_id uuid references public.laundries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, laundry_id)
);

-- ---------------------------------------------------------------------------
-- Monthly customer packages
-- ---------------------------------------------------------------------------
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  laundry_id uuid not null references public.laundries(id) on delete cascade,
  name_ar text not null,
  name_ur text,
  description text,
  price numeric(10,2) not null check (price > 0),
  piece_credits int not null check (piece_credits > 0),
  max_orders int check (max_orders is null or max_orders > 0),
  interval_days int not null default 30 check (interval_days between 7 and 365),
  free_pickup_delivery boolean not null default false,
  eligible_category_ids int[] not null default '{}',
  overage_note text,
  terms text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.packages(laundry_id);

create table public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete restrict,
  laundry_id uuid not null references public.laundries(id) on delete restrict,
  status public.customer_package_status not null default 'pending_payment',
  price_paid numeric(10,2) not null,
  piece_credits int not null,
  pieces_used int not null default 0 check (pieces_used >= 0),
  max_orders int,
  orders_used int not null default 0,
  free_pickup_delivery boolean not null default false,
  period_start timestamptz,
  period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pieces_within_credits check (pieces_used <= piece_credits)
);
create index on public.customer_packages(customer_id, status);

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,20}$'),
  description text,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  max_discount numeric(10,2),
  min_order numeric(10,2) not null default 0,
  laundry_id uuid references public.laundries(id) on delete cascade,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int,
  per_user_limit int not null default 1,
  used_count int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint percent_range check (discount_type <> 'percent' or discount_value <= 100)
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  laundry_id uuid not null references public.laundries(id) on delete restrict,
  client_token uuid not null,
  fulfillment public.fulfillment_method not null,
  status public.order_status not null default 'placed',
  payment_status public.order_payment_status not null default 'unpaid',
  payment_method public.payment_method not null default 'cash',
  contact_name text not null,
  contact_phone text not null,
  city_id int references public.cities(id),
  district_text text,
  address_line text,
  address_lat double precision,
  address_lng double precision,
  address_notes text,
  window_start timestamptz,
  window_end timestamptz,
  notes text,
  subtotal numeric(10,2) not null,
  package_credit numeric(10,2) not null default 0,
  pickup_fee numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  vat_included numeric(10,2) not null default 0,
  total numeric(10,2) not null check (total >= 0),
  is_estimate boolean not null default false,
  final_total numeric(10,2),
  adjustment_note text,
  adjustment_status text check (adjustment_status in ('pending','approved','disputed')),
  commission_amount numeric(10,2) not null default 0,
  promo_code_id uuid references public.promo_codes(id),
  customer_package_id uuid references public.customer_packages(id),
  package_pieces int not null default 0,
  accept_deadline timestamptz,
  rejection_reason text,
  cancellation_reason text,
  cancelled_by uuid,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index orders_idempotency on public.orders(customer_id, client_token);
create index on public.orders(customer_id, created_at desc);
create index on public.orders(laundry_id, status, created_at desc);
create index on public.orders(status, accept_deadline);
create index on public.orders(created_at);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  name_snapshot text not null,
  pricing_model public.pricing_model not null,
  unit_price numeric(10,2),
  quantity numeric(8,2) not null check (quantity > 0),
  line_total numeric(10,2) not null default 0,
  covered_by_package int not null default 0,
  instructions text
);
create index on public.order_items(order_id);

-- Handover codes, readable by the customer only.
create table public.order_secrets (
  order_id uuid primary key references public.orders(id) on delete cascade,
  pickup_code text not null,
  delivery_code text not null,
  failed_attempts int not null default 0
);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status,
  event text not null,
  note text,
  actor_id uuid,
  actor_role text,
  created_at timestamptz not null default now()
);
create index on public.order_events(order_id, created_at);

-- ---------------------------------------------------------------------------
-- Riders and delivery jobs
-- ---------------------------------------------------------------------------
create table public.riders (
  id uuid primary key references public.profiles(id) on delete cascade,
  full_name text not null,
  phone text not null,
  city_id int not null references public.cities(id),
  vehicle_type text not null check (vehicle_type in ('car','motorcycle','bicycle','van')),
  vehicle_plate text,
  national_id text,
  id_document_path text,
  license_document_path text,
  status public.rider_status not null default 'pending',
  is_online boolean not null default false,
  last_lat double precision,
  last_lng double precision,
  last_seen_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.riders(city_id, status, is_online);

create table public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_number text not null,
  leg public.job_leg not null,
  status public.job_status not null default 'open',
  rider_id uuid references public.riders(id),
  city_id int references public.cities(id),
  from_label text not null,
  from_area text,
  from_lat double precision,
  from_lng double precision,
  to_label text not null,
  to_area text,
  to_lat double precision,
  to_lng double precision,
  rider_fee numeric(10,2) not null default 0,
  fail_reason text,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.delivery_jobs(status, city_id);
create index on public.delivery_jobs(rider_id, status);
create index on public.delivery_jobs(order_id);
-- Only one live job per order leg.
create unique index delivery_jobs_one_live_per_leg on public.delivery_jobs(order_id, leg)
  where status in ('open','assigned','picked_up');

-- ---------------------------------------------------------------------------
-- Partner subscriptions, payments, refunds
-- ---------------------------------------------------------------------------
create table public.partner_subscriptions (
  id uuid primary key default gen_random_uuid(),
  laundry_id uuid not null unique references public.laundries(id) on delete cascade,
  status public.subscription_status not null default 'pending',
  price numeric(10,2) not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_used boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.invoice_number_seq;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  kind public.payment_kind not null,
  payer_id uuid references public.profiles(id),
  laundry_id uuid references public.laundries(id),
  order_id uuid references public.orders(id),
  customer_package_id uuid references public.customer_packages(id),
  subscription_id uuid references public.partner_subscriptions(id),
  amount numeric(10,2) not null check (amount >= 0),
  method public.payment_method not null,
  status public.payment_record_status not null default 'pending',
  reference text,
  provider text,
  provider_payment_id text unique,
  invoice_number text unique,
  period_start timestamptz,
  period_end timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.payments(kind, status, created_at);
create index on public.payments(laundry_id);
create index on public.payments(order_id);
-- Never two confirmed payments for the same order (no double charging).
create unique index payments_one_confirmed_per_order on public.payments(order_id)
  where kind = 'order' and status = 'confirmed';
create unique index payments_one_open_per_order on public.payments(order_id)
  where kind = 'order' and status = 'pending';

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_id uuid references public.payments(id),
  amount numeric(10,2) not null check (amount > 0),
  reason text not null,
  status public.refund_status not null default 'pending',
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.refunds(order_id);

-- ---------------------------------------------------------------------------
-- Reviews, support, notifications, audit
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  laundry_id uuid not null references public.laundries(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  partner_reply text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.reviews(laundry_id, created_at desc);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 200),
  status public.ticket_status not null default 'open',
  is_dispute boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.support_tickets(user_id);
create index on public.support_tickets(status);

create table public.ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.ticket_messages(ticket_id, created_at);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs(table_name, created_at desc);
create index on public.audit_logs(created_at desc);
