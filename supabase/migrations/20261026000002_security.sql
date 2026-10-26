-- Just Clean — helpers, guard triggers, audit and Row Level Security.
--
-- Convention: clients may write directly only to low-risk tables (their own
-- profile fields, addresses, favorites, their laundry's menu). Every state
-- transition that moves money or custody (orders, jobs, payments,
-- subscriptions) goes through SECURITY DEFINER functions in the next
-- migration, which validate the caller themselves.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- True when the write comes from a trusted context: a SECURITY DEFINER
-- function (runs as its owner), the service role, or an admin session.
create or replace function public.is_trusted_writer() returns boolean
language sql stable set search_path = public as $$
  select current_user not in ('authenticated','anon') or public.is_admin()
$$;

create or replace function public.owns_laundry(p_laundry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.laundries l where l.id = p_laundry and l.owner_id = auth.uid())
$$;

create or replace function public.can_view_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (
      select 1 from public.orders o
      join public.laundries l on l.id = o.laundry_id
      where o.id = p_order and (o.customer_id = auth.uid() or l.owner_id = auth.uid()))
    or exists (
      select 1 from public.delivery_jobs j
      where j.order_id = p_order and j.rider_id = auth.uid() and j.status in ('assigned','picked_up'))
$$;

create or replace function public.settings() returns public.platform_settings
language sql stable security definer set search_path = public as $$
  select * from public.platform_settings where id = 1
$$;

-- Whether a laundry may appear in search and receive new orders.
create or replace function public.laundry_can_receive_orders(p_laundry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.laundries l
    cross join public.platform_settings s
    left join public.partner_subscriptions ps on ps.laundry_id = l.id
    where l.id = p_laundry
      and s.id = 1
      and l.status = 'approved'
      and l.is_active
      and l.accepting_orders
      and (
        not s.require_active_subscription
        or (ps.status = 'active' and ps.current_period_end > now())
        or (ps.status in ('active','past_due')
            and ps.current_period_end + make_interval(days => s.grace_days) > now())
      )
  )
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','laundries','services','packages','orders','riders',
                           'delivery_jobs','partner_subscriptions','support_tickets','platform_settings']
  loop
    execute format('create trigger touch_%1$s before update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email, full_name)
  values (new.id, new.phone, new.email, nullif(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_contact_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set phone = new.phone, email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_contact_changed after update of phone, email on auth.users
  for each row execute function public.handle_user_contact_change();

-- ---------------------------------------------------------------------------
-- Guard triggers: stop clients from writing privileged columns directly
-- ---------------------------------------------------------------------------
create or replace function public.guard_profiles() returns trigger
language plpgsql as $$
begin
  if not public.is_trusted_writer() then
    new.is_admin := old.is_admin;
    new.phone := old.phone;
    new.email := old.email;
    new.id := old.id;
  end if;
  return new;
end $$;
create trigger guard_profiles before update on public.profiles
  for each row execute function public.guard_profiles();

create or replace function public.guard_laundries() returns trigger
language plpgsql as $$
begin
  if public.is_trusted_writer() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.status := 'draft';
    new.is_active := true;
    new.review_notes := null;
    new.submitted_at := null;
    new.approved_at := null;
    new.rating_avg := 0;
    new.rating_count := 0;
  else
    new.owner_id := old.owner_id;
    new.status := old.status;
    new.is_active := old.is_active;
    new.review_notes := old.review_notes;
    new.submitted_at := old.submitted_at;
    new.approved_at := old.approved_at;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
  end if;
  return new;
end $$;
create trigger guard_laundries before insert or update on public.laundries
  for each row execute function public.guard_laundries();

create or replace function public.guard_riders() returns trigger
language plpgsql as $$
begin
  if public.is_trusted_writer() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.id := auth.uid();
    new.status := 'pending';
    new.is_online := false;
    new.review_notes := null;
  else
    new.id := old.id;
    new.status := old.status;
    new.review_notes := old.review_notes;
    new.city_id := old.city_id;
    if new.is_online and old.status <> 'active' then
      raise exception 'rider_not_active' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger guard_riders before insert or update on public.riders
  for each row execute function public.guard_riders();

-- ---------------------------------------------------------------------------
-- Ratings aggregate
-- ---------------------------------------------------------------------------
create or replace function public.refresh_laundry_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_laundry uuid := coalesce(new.laundry_id, old.laundry_id);
begin
  update public.laundries l set
    rating_avg = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r
                           where r.laundry_id = v_laundry and not r.is_hidden), 0),
    rating_count = (select count(*) from public.reviews r where r.laundry_id = v_laundry and not r.is_hidden)
  where l.id = v_laundry;
  return null;
end $$;
create trigger reviews_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_laundry_rating();

-- ---------------------------------------------------------------------------
-- Audit log for sensitive tables
-- ---------------------------------------------------------------------------
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_id text := coalesce(v_new->>'id', v_old->>'id');
begin
  -- Skip pure rating / timestamp churn.
  if tg_op = 'UPDATE' and (v_old - 'updated_at' - 'rating_avg' - 'rating_count' - 'last_lat' - 'last_lng' - 'last_seen_at')
                        = (v_new - 'updated_at' - 'rating_avg' - 'rating_count' - 'last_lat' - 'last_lng' - 'last_seen_at') then
    return null;
  end if;
  -- Never copy bank details into the audit trail.
  v_old := v_old - 'settlement_iban';
  v_new := v_new - 'settlement_iban';
  insert into public.audit_logs (actor_id, table_name, record_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, v_id, lower(tg_op), v_old, v_new);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['laundries','riders','partner_subscriptions','payments','refunds',
                           'platform_settings','promo_codes','cities','districts','service_categories']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;

create or replace function public.audit_profile_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin then
    insert into public.audit_logs (actor_id, table_name, record_id, action, old_data, new_data)
    values (auth.uid(), 'profiles', new.id::text, 'admin_flag',
            jsonb_build_object('is_admin', old.is_admin), jsonb_build_object('is_admin', new.is_admin));
  end if;
  return null;
end $$;
create trigger audit_profile_admin after update on public.profiles
  for each row execute function public.audit_profile_admin();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.districts enable row level security;
alter table public.service_categories enable row level security;
alter table public.laundries enable row level security;
alter table public.laundry_categories enable row level security;
alter table public.laundry_documents enable row level security;
alter table public.services enable row level security;
alter table public.addresses enable row level security;
alter table public.favorites enable row level security;
alter table public.packages enable row level security;
alter table public.customer_packages enable row level security;
alter table public.promo_codes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_secrets enable row level security;
alter table public.order_events enable row level security;
alter table public.riders enable row level security;
alter table public.delivery_jobs enable row level security;
alter table public.partner_subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.reviews enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Settings: public read (fees and subscription price are shown on signup); admin write.
create policy settings_read on public.platform_settings for select using (true);
create policy settings_admin on public.platform_settings for update using (public.is_admin()) with check (public.is_admin());

-- Profiles
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Reference data
create policy cities_read on public.cities for select using (is_active or public.is_admin());
create policy cities_admin on public.cities for all using (public.is_admin()) with check (public.is_admin());
create policy districts_read on public.districts for select using (is_active or public.is_admin());
create policy districts_admin on public.districts for all using (public.is_admin()) with check (public.is_admin());
create policy categories_read on public.service_categories for select using (is_active or public.is_admin());
create policy categories_admin on public.service_categories for all using (public.is_admin()) with check (public.is_admin());

-- Laundries: public sees approved+active; owner sees and edits own; admin all.
create policy laundries_public on public.laundries for select
  using ((status = 'approved' and is_active) or owner_id = auth.uid() or public.is_admin());
create policy laundries_owner_insert on public.laundries for insert
  with check (owner_id = auth.uid());
create policy laundries_owner_update on public.laundries for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy laundries_admin_delete on public.laundries for delete using (public.is_admin());

create policy laundry_categories_read on public.laundry_categories for select using (true);
create policy laundry_categories_owner on public.laundry_categories for all
  using (public.owns_laundry(laundry_id) or public.is_admin())
  with check (public.owns_laundry(laundry_id) or public.is_admin());

create policy laundry_documents_owner on public.laundry_documents for all
  using (public.owns_laundry(laundry_id) or public.is_admin())
  with check (public.owns_laundry(laundry_id) or public.is_admin());

-- Services and packages: public reads active rows of visible laundries.
create policy services_read on public.services for select using (
  (is_active and exists (select 1 from public.laundries l where l.id = laundry_id and l.status = 'approved' and l.is_active))
  or public.owns_laundry(laundry_id) or public.is_admin());
create policy services_owner on public.services for all
  using (public.owns_laundry(laundry_id) or public.is_admin())
  with check (public.owns_laundry(laundry_id) or public.is_admin());

create policy packages_read on public.packages for select using (
  (is_active and exists (select 1 from public.laundries l where l.id = laundry_id and l.status = 'approved' and l.is_active))
  or public.owns_laundry(laundry_id) or public.is_admin());
create policy packages_owner on public.packages for all
  using (public.owns_laundry(laundry_id) or public.is_admin())
  with check (public.owns_laundry(laundry_id) or public.is_admin());

create policy customer_packages_read on public.customer_packages for select
  using (customer_id = auth.uid() or public.owns_laundry(laundry_id) or public.is_admin());

-- Customer-owned data
create policy addresses_own on public.addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favorites_own on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Promo codes: admin only (customers validate through quote_order()).
create policy promos_admin on public.promo_codes for all using (public.is_admin()) with check (public.is_admin());

-- Orders and children: read-only for participants; writes via functions.
create policy orders_read on public.orders for select using (public.can_view_order(id));
create policy order_items_read on public.order_items for select using (public.can_view_order(order_id));
create policy order_events_read on public.order_events for select using (public.can_view_order(order_id));
create policy order_secrets_customer on public.order_secrets for select using (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

-- Riders
create policy riders_self on public.riders for select using (id = auth.uid() or public.is_admin());
create policy riders_insert on public.riders for insert with check (id = auth.uid());
create policy riders_update on public.riders for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Delivery jobs: rider sees own; order participants see theirs. Open jobs via rider_open_jobs().
create policy jobs_read on public.delivery_jobs for select using (
  rider_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.orders o join public.laundries l on l.id = o.laundry_id
             where o.id = order_id and (o.customer_id = auth.uid() or l.owner_id = auth.uid())));

-- Subscriptions / payments / refunds
create policy subs_read on public.partner_subscriptions for select
  using (public.owns_laundry(laundry_id) or public.is_admin());
create policy payments_read on public.payments for select using (
  payer_id = auth.uid() or public.is_admin()
  or (laundry_id is not null and public.owns_laundry(laundry_id)));
create policy refunds_read on public.refunds for select using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

-- Reviews: public reads visible ones.
create policy reviews_read on public.reviews for select
  using (not is_hidden or customer_id = auth.uid() or public.owns_laundry(laundry_id) or public.is_admin());
create policy reviews_admin on public.reviews for update using (public.is_admin()) with check (public.is_admin());

-- Support
create policy tickets_own on public.support_tickets for select using (user_id = auth.uid() or public.is_admin());
create policy tickets_insert on public.support_tickets for insert with check (user_id = auth.uid());
create policy tickets_admin on public.support_tickets for update using (public.is_admin()) with check (public.is_admin());
create policy ticket_messages_read on public.ticket_messages for select using (
  public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create policy ticket_messages_insert on public.ticket_messages for insert with check (
  author_id = auth.uid() and (
    (public.is_admin() and is_staff)
    or (not is_staff and exists (select 1 from public.support_tickets t
                                 where t.id = ticket_id and t.user_id = auth.uid() and t.status <> 'closed'))));

-- Notifications
create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Audit: admin read only.
create policy audit_admin on public.audit_logs for select using (public.is_admin());

-- Column-level grants: clients can only flip read_at on notifications.
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
