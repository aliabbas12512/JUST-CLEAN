-- Just Clean — order engine and workflow functions.
-- Every function validates the caller itself; RLS is bypassed inside
-- SECURITY DEFINER bodies, so the checks below are the authorization.

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------
create or replace function public._uid() returns uuid
language plpgsql stable set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v;
end $$;

create or replace function public._fail(p_code text) returns void
language plpgsql set search_path = public as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end $$;

create or replace function public._notify(p_user uuid, p_kind text, p_data jsonb, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, data, link)
  select p_user, p_kind, coalesce(p_data, '{}'::jsonb), p_link where p_user is not null
$$;

create or replace function public._notify_admins(p_kind text, p_data jsonb, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, data, link)
  select p.id, p_kind, coalesce(p_data, '{}'::jsonb), p_link from public.profiles p where p.is_admin
$$;

create or replace function public._event(p_order uuid, p_status public.order_status, p_event text, p_note text, p_role text)
returns void language sql security definer set search_path = public as $$
  insert into public.order_events (order_id, status, event, note, actor_id, actor_role)
  values (p_order, p_status, p_event, p_note, auth.uid(), p_role)
$$;

-- 4-digit handover code from a cryptographically random UUID.
create or replace function public._handover_code() returns text
language sql volatile set search_path = public as $$
  select lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 9000) + 1000)::text, 4, '0')
$$;

create or replace function public._needs_pickup(f public.fulfillment_method) returns boolean
language sql immutable set search_path = public as $$ select f in ('pickup_delivery','pickup_only') $$;

create or replace function public._needs_return(f public.fulfillment_method) returns boolean
language sql immutable set search_path = public as $$ select f in ('pickup_delivery','delivery_only') $$;

-- Sets status + writes a timeline event + notifies the customer.
create or replace function public._set_status(p_order uuid, p_status public.order_status, p_event text, p_note text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_customer uuid; v_number text;
begin
  update public.orders set status = p_status,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end
  where id = p_order
  returning customer_id, order_number into v_customer, v_number;
  perform public._event(p_order, p_status, p_event, p_note, p_role);
  perform public._notify(v_customer, 'order_status',
    jsonb_build_object('order_number', v_number, 'status', p_status), '/orders/' || p_order);
end $$;

-- Opens a delivery job for the given leg (idempotent per live leg).
create or replace function public._open_job(p_order uuid, p_leg public.job_leg)
returns uuid language plpgsql security definer set search_path = public as $$
declare o record; l record; v_id uuid; v_fee numeric; v_area text;
begin
  select * into o from public.orders where id = p_order;
  -- Area shown to riders before they claim: district, else the city name (never the street address).
  v_area := coalesce(nullif(o.district_text, ''), (select c.name_ar from public.cities c where c.id = o.city_id));
  select * into l from public.laundries where id = o.laundry_id;
  select id into v_id from public.delivery_jobs
    where order_id = p_order and leg = p_leg and status in ('open','assigned','picked_up');
  if v_id is not null then
    return v_id;
  end if;
  v_fee := (public.settings()).rider_fee_per_leg;
  if p_leg = 'pickup' then
    insert into public.delivery_jobs (order_id, order_number, leg, city_id, from_label, from_area, from_lat, from_lng,
                                      to_label, to_area, to_lat, to_lng, rider_fee)
    values (p_order, o.order_number, 'pickup', o.city_id, coalesce(o.address_line, ''), v_area, o.address_lat, o.address_lng,
            l.name || ' — ' || l.address, coalesce(l.district_text, l.name), l.lat, l.lng, v_fee)
    returning id into v_id;
  else
    insert into public.delivery_jobs (order_id, order_number, leg, city_id, from_label, from_area, from_lat, from_lng,
                                      to_label, to_area, to_lat, to_lng, rider_fee)
    values (p_order, o.order_number, 'return', o.city_id, l.name || ' — ' || l.address, coalesce(l.district_text, l.name), l.lat, l.lng,
            coalesce(o.address_line, ''), v_area, o.address_lat, o.address_lng, v_fee)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public._cancel_live_jobs(p_order uuid) returns void
language sql security definer set search_path = public as $$
  update public.delivery_jobs set status = 'cancelled'
  where order_id = p_order and status in ('open','assigned')
$$;

-- Restores package credits when an order that used them is cancelled.
create or replace function public._release_package(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select customer_package_id, package_pieces into o from public.orders where id = p_order;
  if o.customer_package_id is not null then
    update public.customer_packages set
      pieces_used = greatest(pieces_used - o.package_pieces, 0),
      orders_used = greatest(orders_used - 1, 0),
      status = case when status = 'exhausted' then 'active' else status end
    where id = o.customer_package_id;
  end if;
end $$;

-- Creates a pending refund record if the order was paid.
create or replace function public._refund_if_paid(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from public.payments where order_id = p_order and kind = 'order' and status = 'confirmed';
  if p.id is not null and not exists (select 1 from public.refunds where order_id = p_order and status <> 'rejected') then
    insert into public.refunds (order_id, payment_id, amount, reason) values (p_order, p.id, p.amount, p_reason);
    perform public._notify_admins('refund_pending', jsonb_build_object('order_id', p_order), '/admin/orders/' || p_order);
  end if;
end $$;

revoke execute on function public._uid(), public._fail(text), public._notify(uuid,text,jsonb,text),
  public._notify_admins(text,jsonb,text), public._event(uuid,public.order_status,text,text,text),
  public._handover_code(), public._set_status(uuid,public.order_status,text,text,text),
  public._open_job(uuid,public.job_leg), public._cancel_live_jobs(uuid), public._release_package(uuid),
  public._refund_if_paid(uuid,text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Discovery
-- ---------------------------------------------------------------------------
create or replace function public.nearby_laundries(
  p_lat double precision default null,
  p_lng double precision default null,
  p_city_id int default null,
  p_category_id int default null,
  p_search text default null
) returns table (
  id uuid, name text, logo_path text, city_id int, district_text text, address text,
  lat double precision, lng double precision, distance_km double precision,
  rating_avg numeric, rating_count int, min_order numeric, prep_hours int,
  pickup_fee numeric, delivery_fee numeric,
  supports_pickup boolean, supports_delivery boolean, supports_dropoff boolean,
  opening_hours jsonb, starting_price numeric, category_ids int[], service_radius_km numeric
)
language sql stable security definer set search_path = public as $$
  with s as (select max_search_radius_km from public.platform_settings where id = 1),
  base as (
    select l.*,
      case when p_lat is null or p_lng is null then null
           else 6371 * 2 * asin(sqrt(
             power(sin(radians(l.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - p_lng) / 2), 2)))
      end as dist
    from public.laundries l
    where l.status = 'approved' and l.is_active
      and public.laundry_can_receive_orders(l.id)
      and (p_city_id is null or l.city_id = p_city_id)
      -- cheap bounding box (~0.5 degree) before the exact distance check
      and (p_lat is null or (l.lat between p_lat - 0.5 and p_lat + 0.5 and l.lng between p_lng - 0.5 and p_lng + 0.5))
      and (p_search is null or p_search = '' or l.name ilike '%' || p_search || '%'
           or exists (select 1 from public.services sv where sv.laundry_id = l.id and sv.is_active and sv.name_ar ilike '%' || p_search || '%'))
  )
  select b.id, b.name, b.logo_path, b.city_id, b.district_text, b.address, b.lat, b.lng, b.dist,
    b.rating_avg, b.rating_count, b.min_order, b.prep_hours, b.pickup_fee, b.delivery_fee,
    b.supports_pickup, b.supports_delivery, b.supports_dropoff, b.opening_hours,
    (select min(sv.price) from public.services sv where sv.laundry_id = b.id and sv.is_active and sv.price is not null),
    coalesce((select array_agg(distinct sv.category_id) from public.services sv where sv.laundry_id = b.id and sv.is_active), '{}'),
    b.service_radius_km
  from base b, s
  where (b.dist is null or b.dist <= least(b.service_radius_km, s.max_search_radius_km))
    and (p_category_id is null or exists (select 1 from public.services sv
                                          where sv.laundry_id = b.id and sv.is_active and sv.category_id = p_category_id))
  order by b.dist nulls last, b.rating_avg desc, b.rating_count desc
  limit 100
$$;

-- ---------------------------------------------------------------------------
-- Pricing (single source of truth for both preview and placement)
-- ---------------------------------------------------------------------------
create or replace function public.quote_order(
  p_laundry_id uuid,
  p_fulfillment public.fulfillment_method,
  p_items jsonb,
  p_promo_code text default null,
  p_customer_package_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l public.laundries; s public.platform_settings; it jsonb; sv public.services;
  cp public.customer_packages; pr public.promo_codes;
  v_qty numeric; v_line numeric; v_subtotal numeric := 0; v_estimate boolean := false;
  v_items jsonb := '[]'::jsonb; v_errors text[] := '{}'::text[];
  v_pickup numeric := 0; v_delivery numeric := 0; v_discount numeric := 0;
  v_pkg_remaining int := 0; v_pkg_cover int; v_pkg_pieces int := 0; v_pkg_credit numeric := 0;
  v_total numeric; v_vat numeric := 0; v_uid uuid := auth.uid(); v_eligible boolean;
begin
  select * into s from public.platform_settings where id = 1;
  select * into l from public.laundries where id = p_laundry_id;
  if l.id is null or not public.laundry_can_receive_orders(p_laundry_id) then
    v_errors := array_append(v_errors, 'laundry_unavailable');
  end if;
  if (p_fulfillment = 'pickup_delivery' and not (l.supports_pickup and l.supports_delivery))
     or (p_fulfillment = 'pickup_only' and not l.supports_pickup)
     or (p_fulfillment = 'delivery_only' and not l.supports_delivery)
     or (p_fulfillment = 'dropoff' and not l.supports_dropoff) then
    v_errors := array_append(v_errors, 'fulfillment_unsupported');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    v_errors := array_append(v_errors, 'cart_empty');
    p_items := '[]'::jsonb;
  end if;
  if jsonb_array_length(p_items) > 50 then
    v_errors := array_append(v_errors, 'too_many_items');
  end if;

  if p_customer_package_id is not null then
    select * into cp from public.customer_packages
      where id = p_customer_package_id and customer_id = v_uid and laundry_id = p_laundry_id
        and status = 'active' and period_end > now();
    if cp.id is null then
      v_errors := array_append(v_errors, 'package_invalid');
    elsif cp.max_orders is not null and cp.orders_used >= cp.max_orders then
      v_errors := array_append(v_errors, 'package_order_limit');
    else
      v_pkg_remaining := cp.piece_credits - cp.pieces_used;
    end if;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into sv from public.services
      where id = (it->>'service_id')::uuid and laundry_id = p_laundry_id and is_active;
    v_qty := coalesce((it->>'quantity')::numeric, 0);
    if sv.id is null then
      v_errors := array_append(v_errors, 'service_unavailable');
      continue;
    end if;
    if v_qty <= 0 or v_qty > 500 then
      v_errors := array_append(v_errors, 'invalid_quantity');
      continue;
    end if;
    if sv.pricing_model in ('per_piece','bundle','fixed') and v_qty <> trunc(v_qty) then
      v_errors := array_append(v_errors, 'invalid_quantity');
      continue;
    end if;
    v_line := case when sv.pricing_model = 'quote' then 0 else round(sv.price * v_qty, 2) end;
    if sv.pricing_model in ('per_kg','quote') then
      v_estimate := true;
    end if;
    -- Package credits cover per-piece items in eligible categories only.
    v_pkg_cover := 0;
    if cp.id is not null and sv.pricing_model = 'per_piece' and v_pkg_remaining > 0 then
      select coalesce(array_length(p.eligible_category_ids, 1), 0) = 0 or sv.category_id = any(p.eligible_category_ids)
        into v_eligible from public.packages p where p.id = cp.package_id;
      if v_eligible then
        v_pkg_cover := least(v_qty::int, v_pkg_remaining);
        v_pkg_remaining := v_pkg_remaining - v_pkg_cover;
        v_pkg_pieces := v_pkg_pieces + v_pkg_cover;
        v_pkg_credit := v_pkg_credit + round(sv.price * v_pkg_cover, 2);
      end if;
    end if;
    v_subtotal := v_subtotal + v_line;
    v_items := v_items || jsonb_build_object(
      'service_id', sv.id, 'name', sv.name_ar, 'name_ur', sv.name_ur, 'pricing_model', sv.pricing_model,
      'unit_price', sv.price, 'quantity', v_qty, 'line_total', v_line, 'covered_by_package', v_pkg_cover,
      'instructions', left(it->>'instructions', 300));
  end loop;

  if l.id is not null then
    if public._needs_pickup(p_fulfillment) then v_pickup := l.pickup_fee; end if;
    if public._needs_return(p_fulfillment) then v_delivery := l.delivery_fee; end if;
    if cp.id is not null and cp.free_pickup_delivery then
      v_pickup := 0; v_delivery := 0;
    end if;
    if v_subtotal < l.min_order and not v_estimate then
      v_errors := array_append(v_errors, 'below_min_order');
    end if;
  end if;

  if p_promo_code is not null and p_promo_code <> '' then
    select * into pr from public.promo_codes
      where code = upper(p_promo_code) and is_active
        and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
        and (laundry_id is null or laundry_id = p_laundry_id)
        and (usage_limit is null or used_count < usage_limit);
    if pr.id is null then
      v_errors := array_append(v_errors, 'promo_invalid');
    elsif v_subtotal - v_pkg_credit < pr.min_order then
      v_errors := array_append(v_errors, 'promo_min_order');
    elsif v_uid is not null and (select count(*) from public.orders o
           where o.customer_id = v_uid and o.promo_code_id = pr.id and o.status <> 'cancelled') >= pr.per_user_limit then
      v_errors := array_append(v_errors, 'promo_used');
    else
      v_discount := case when pr.discount_type = 'percent'
                         then round((v_subtotal - v_pkg_credit) * pr.discount_value / 100, 2)
                         else pr.discount_value end;
      if pr.max_discount is not null then v_discount := least(v_discount, pr.max_discount); end if;
      v_discount := least(v_discount, v_subtotal - v_pkg_credit);
    end if;
  end if;

  v_total := greatest(v_subtotal - v_pkg_credit - v_discount + v_pickup + v_delivery, 0);
  -- Consumer prices in KSA are VAT-inclusive; show the included portion if the laundry is VAT registered.
  if l.vat_registered and s.vat_rate > 0 then
    v_vat := round(v_total * s.vat_rate / (100 + s.vat_rate), 2);
  end if;

  return jsonb_build_object(
    'items', v_items, 'subtotal', v_subtotal, 'package_credit', v_pkg_credit, 'package_pieces', v_pkg_pieces,
    'pickup_fee', v_pickup, 'delivery_fee', v_delivery, 'discount', v_discount, 'vat_included', v_vat,
    'total', v_total, 'is_estimate', v_estimate, 'min_order', coalesce(l.min_order, 0),
    'promo_code_id', pr.id, 'errors', to_jsonb(array(select distinct unnest(v_errors))));
end $$;

-- ---------------------------------------------------------------------------
-- Customer actions
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_client_token uuid,
  p_laundry_id uuid,
  p_fulfillment public.fulfillment_method,
  p_items jsonb,
  p_contact jsonb,
  p_address jsonb,
  p_window_start timestamptz default null,
  p_window_end timestamptz default null,
  p_notes text default null,
  p_promo_code text default null,
  p_customer_package_id uuid default null,
  p_payment_method public.payment_method default 'cash'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._uid(); q jsonb; s record; l record; v_existing record;
  v_id uuid; v_number text; it jsonb; v_needs_address boolean;
begin
  -- Idempotency: a retried submit returns the original order instead of creating a duplicate.
  select id, order_number into v_existing from public.orders where customer_id = v_uid and client_token = p_client_token;
  if v_existing.id is not null then
    return jsonb_build_object('id', v_existing.id, 'order_number', v_existing.order_number, 'duplicate', true);
  end if;

  if coalesce(trim(p_contact->>'name'), '') = '' or coalesce(p_contact->>'phone', '') !~ '^\+?[0-9]{9,15}$' then
    perform public._fail('contact_invalid');
  end if;
  if p_payment_method = 'online' then
    -- Online order payment is only enabled once a provider is wired up server-side.
    perform public._fail('payment_method_unavailable');
  end if;
  v_needs_address := p_fulfillment <> 'dropoff';
  if v_needs_address and (coalesce(trim(p_address->>'line'), '') = '' or (p_address->>'city_id') is null) then
    perform public._fail('address_required');
  end if;
  if p_window_start is not null and (p_window_end is null or p_window_end <= p_window_start or p_window_start < now() - interval '10 minutes') then
    perform public._fail('window_invalid');
  end if;

  -- Lock the package row so concurrent orders cannot overspend credits.
  if p_customer_package_id is not null then
    perform 1 from public.customer_packages where id = p_customer_package_id for update;
  end if;

  q := public.quote_order(p_laundry_id, p_fulfillment, p_items, p_promo_code, p_customer_package_id);
  if jsonb_array_length(q->'errors') > 0 then
    perform public._fail(q->'errors'->>0);
  end if;

  select * into s from public.platform_settings where id = 1;
  select * into l from public.laundries where id = p_laundry_id;
  v_number := s.order_prefix || '-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY') || '-'
              || lpad(nextval('public.order_number_seq')::text, 6, '0');

  insert into public.orders (
    order_number, customer_id, laundry_id, client_token, fulfillment, payment_method,
    contact_name, contact_phone, city_id, district_text, address_line, address_lat, address_lng, address_notes,
    window_start, window_end, notes, subtotal, package_credit, pickup_fee, delivery_fee, discount, vat_included,
    total, is_estimate, promo_code_id, customer_package_id, package_pieces, accept_deadline)
  values (
    v_number, v_uid, p_laundry_id, p_client_token, p_fulfillment, p_payment_method,
    left(trim(p_contact->>'name'), 120), p_contact->>'phone',
    coalesce((p_address->>'city_id')::int, l.city_id),
    left(p_address->>'district_text', 120), left(p_address->>'line', 500),
    (p_address->>'lat')::double precision, (p_address->>'lng')::double precision, left(p_address->>'notes', 500),
    p_window_start, p_window_end, left(p_notes, 1000),
    (q->>'subtotal')::numeric, (q->>'package_credit')::numeric, (q->>'pickup_fee')::numeric,
    (q->>'delivery_fee')::numeric, (q->>'discount')::numeric, (q->>'vat_included')::numeric,
    (q->>'total')::numeric, (q->>'is_estimate')::boolean, (q->>'promo_code_id')::uuid,
    p_customer_package_id, (q->>'package_pieces')::int,
    now() + make_interval(mins => s.order_accept_timeout_minutes))
  returning id into v_id;

  for it in select * from jsonb_array_elements(q->'items') loop
    insert into public.order_items (order_id, service_id, name_snapshot, pricing_model, unit_price, quantity,
                                    line_total, covered_by_package, instructions)
    values (v_id, (it->>'service_id')::uuid, it->>'name', (it->>'pricing_model')::public.pricing_model,
            (it->>'unit_price')::numeric, (it->>'quantity')::numeric, (it->>'line_total')::numeric,
            (it->>'covered_by_package')::int, it->>'instructions');
  end loop;

  insert into public.order_secrets (order_id, pickup_code, delivery_code)
  values (v_id, public._handover_code(), public._handover_code());

  if (q->>'promo_code_id') is not null then
    update public.promo_codes set used_count = used_count + 1 where id = (q->>'promo_code_id')::uuid;
  end if;
  if p_customer_package_id is not null then
    update public.customer_packages set
      pieces_used = pieces_used + (q->>'package_pieces')::int,
      orders_used = orders_used + 1,
      status = case when pieces_used + (q->>'package_pieces')::int >= piece_credits then 'exhausted' else status end
    where id = p_customer_package_id;
  end if;

  perform public._event(v_id, 'placed', 'placed', null, 'customer');
  perform public._notify(l.owner_id, 'new_order', jsonb_build_object('order_number', v_number), '/partner/orders/' || v_id);
  return jsonb_build_object('id', v_id, 'order_number', v_number, 'duplicate', false);
end $$;

create or replace function public.cancel_order(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.customer_id <> v_uid then perform public._fail('not_found'); end if;
  -- Customers may cancel until clothes have left their hands.
  if o.status not in ('placed','accepted','pickup_assigned') then perform public._fail('cannot_cancel'); end if;
  update public.orders set cancellation_reason = left(p_reason, 500), cancelled_by = v_uid where id = p_order;
  perform public._cancel_live_jobs(p_order);
  perform public._release_package(p_order);
  perform public._refund_if_paid(p_order, 'customer_cancelled');
  perform public._set_status(p_order, 'cancelled', 'cancelled_by_customer', p_reason, 'customer');
  perform public._notify((select owner_id from public.laundries where id = o.laundry_id), 'order_cancelled',
    jsonb_build_object('order_number', o.order_number), '/partner/orders/' || p_order);
end $$;

create or replace function public.respond_price_adjustment(p_order uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.customer_id <> v_uid then perform public._fail('not_found'); end if;
  if o.adjustment_status is distinct from 'pending' then perform public._fail('no_pending_adjustment'); end if;
  update public.orders set adjustment_status = case when p_approve then 'approved' else 'disputed' end where id = p_order;
  perform public._event(p_order, o.status, case when p_approve then 'price_approved' else 'price_disputed' end, null, 'customer');
  perform public._notify((select owner_id from public.laundries where id = o.laundry_id),
    case when p_approve then 'price_approved' else 'price_disputed' end,
    jsonb_build_object('order_number', o.order_number), '/partner/orders/' || p_order);
  if not p_approve then
    perform public._notify_admins('price_disputed', jsonb_build_object('order_number', o.order_number), '/admin/orders/' || p_order);
  end if;
end $$;

create or replace function public.confirm_order_received(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.customer_id <> v_uid then perform public._fail('not_found'); end if;
  if o.status <> 'delivered' then perform public._fail('invalid_transition'); end if;
  perform public._complete_order(p_order, 'customer');
end $$;

create or replace function public._complete_order(p_order uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select * into s from public.platform_settings where id = 1;
  if s.commission_enabled then
    update public.orders set commission_amount =
      round(coalesce(case when adjustment_status = 'approved' then final_total end, total) * s.commission_percent / 100, 2)
    where id = p_order;
  end if;
  perform public._set_status(p_order, 'completed', 'completed', null, p_role);
end $$;
revoke execute on function public._complete_order(uuid, text) from public, anon, authenticated;

create or replace function public.submit_review(p_order uuid, p_rating int, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); o record;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or o.customer_id <> v_uid then perform public._fail('not_found'); end if;
  if o.status not in ('delivered','completed') then perform public._fail('cannot_review_yet'); end if;
  if p_rating not between 1 and 5 then perform public._fail('invalid_rating'); end if;
  insert into public.reviews (order_id, laundry_id, customer_id, rating, comment)
  values (p_order, o.laundry_id, v_uid, p_rating, nullif(left(trim(p_comment), 1000), ''))
  on conflict (order_id) do nothing;
end $$;

create or replace function public.purchase_package(p_package uuid, p_method public.payment_method)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); p record; v_id uuid;
begin
  select * into p from public.packages where id = p_package and is_active;
  if p.id is null or not public.laundry_can_receive_orders(p.laundry_id) then perform public._fail('package_unavailable'); end if;
  if p_method = 'online' then perform public._fail('payment_method_unavailable'); end if;
  if exists (select 1 from public.customer_packages where customer_id = v_uid and package_id = p_package
             and status in ('pending_payment','active')) then
    perform public._fail('package_already_owned');
  end if;
  insert into public.customer_packages (customer_id, package_id, laundry_id, price_paid, piece_credits, max_orders, free_pickup_delivery)
  values (v_uid, p.id, p.laundry_id, p.price, p.piece_credits, p.max_orders, p.free_pickup_delivery)
  returning id into v_id;
  insert into public.payments (kind, payer_id, laundry_id, customer_package_id, amount, method)
  values ('customer_package', v_uid, p.laundry_id, v_id, p.price, p_method);
  perform public._notify((select owner_id from public.laundries where id = p.laundry_id), 'package_purchase_pending',
    jsonb_build_object('package', p.name_ar), '/partner/packages');
  return v_id;
end $$;

create or replace function public.cancel_customer_package(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._uid(); cp record;
begin
  select * into cp from public.customer_packages where id = p_id for update;
  if cp.id is null or cp.customer_id <> v_uid then perform public._fail('not_found'); end if;
  if cp.status not in ('pending_payment','active','exhausted') then perform public._fail('invalid_transition'); end if;
  -- Refunds for a paid package follow the package terms and are handled by support, not automatically.
  update public.customer_packages set status = 'cancelled', cancelled_at = now() where id = p_id;
  update public.payments set status = 'failed', notes = 'cancelled_by_customer'
    where customer_package_id = p_id and status = 'pending';
end $$;

-- ---------------------------------------------------------------------------
-- Partner actions
-- ---------------------------------------------------------------------------
create or replace function public._assert_owner(p_laundry uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.laundries where id = p_laundry and owner_id = auth.uid()) and not public.is_admin() then
    perform public._fail('forbidden');
  end if;
end $$;
revoke execute on function public._assert_owner(uuid) from public, anon, authenticated;

create or replace function public.submit_laundry(p_laundry uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l record;
begin
  perform public._uid();
  select * into l from public.laundries where id = p_laundry and owner_id = auth.uid() for update;
  if l.id is null then perform public._fail('not_found'); end if;
  if l.status not in ('draft','info_required','rejected') then perform public._fail('invalid_transition'); end if;
  if l.terms_accepted_at is null then perform public._fail('terms_required'); end if;
  update public.laundries set status = 'submitted', submitted_at = now() where id = p_laundry;
  perform public._notify_admins('laundry_submitted', jsonb_build_object('name', l.name), '/admin/laundries/' || p_laundry);
end $$;

create or replace function public.partner_respond_order(p_order uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  perform public._uid();
  select * into o from public.orders where id = p_order for update;
  if o.id is null then perform public._fail('not_found'); end if;
  perform public._assert_owner(o.laundry_id);
  if o.status <> 'placed' then perform public._fail('invalid_transition'); end if;
  if p_accept then
    perform public._set_status(p_order, 'accepted', 'accepted', null, 'partner');
    if public._needs_pickup(o.fulfillment) then
      perform public._open_job(p_order, 'pickup');
    end if;
  else
    update public.orders set rejection_reason = left(p_reason, 500) where id = p_order;
    perform public._release_package(p_order);
    perform public._refund_if_paid(p_order, 'rejected_by_laundry');
    perform public._set_status(p_order, 'rejected', 'rejected', p_reason, 'partner');
  end if;
end $$;

-- Laundry-side status steps. Rider steps live in rider_* functions.
create or replace function public.partner_advance_order(p_order uuid, p_to public.order_status, p_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o record; sec record; j record;
begin
  perform public._uid();
  select * into o from public.orders where id = p_order for update;
  if o.id is null then perform public._fail('not_found'); end if;
  perform public._assert_owner(o.laundry_id);

  if p_to = 'received' then
    -- From rider (pickup leg delivered to shop) or customer walked in (drop-off / delivery-only).
    if o.status = 'picked_up' and public._needs_pickup(o.fulfillment) then
      update public.delivery_jobs set status = 'delivered', delivered_at = now()
        where order_id = p_order and leg = 'pickup' and status = 'picked_up';
    elsif not (o.status = 'accepted' and o.fulfillment in ('dropoff','delivery_only')) then
      perform public._fail('invalid_transition');
    end if;
  elsif p_to = 'processing' then
    if o.status <> 'received' then perform public._fail('invalid_transition'); end if;
  elsif p_to = 'ready' then
    if o.status <> 'processing' then perform public._fail('invalid_transition'); end if;
    if o.adjustment_status = 'pending' then perform public._fail('adjustment_pending'); end if;
  elsif p_to = 'out_for_delivery' then
    -- Laundry hands the bag to the assigned return rider.
    if o.status <> 'return_assigned' then perform public._fail('invalid_transition'); end if;
    update public.delivery_jobs set status = 'picked_up', picked_up_at = now()
      where order_id = p_order and leg = 'return' and status = 'assigned'
      returning * into j;
    if j.id is null then perform public._fail('no_assigned_rider'); end if;
  elsif p_to = 'completed' then
    -- Customer collects at the shop: verify with the customer's delivery code.
    if o.status <> 'ready' or public._needs_return(o.fulfillment) then perform public._fail('invalid_transition'); end if;
    select * into sec from public.order_secrets where order_id = p_order for update;
    if sec.failed_attempts >= 5 then perform public._fail('code_locked'); end if;
    if p_code is distinct from sec.delivery_code then
      update public.order_secrets set failed_attempts = failed_attempts + 1 where order_id = p_order;
      perform public._fail('invalid_code');
    end if;
    perform public._complete_order(p_order, 'partner');
    return;
  else
    perform public._fail('invalid_transition');
  end if;

  perform public._set_status(p_order, p_to, p_to::text, null, 'partner');
  if p_to = 'ready' and public._needs_return(o.fulfillment) then
    perform public._open_job(p_order, 'return');
  end if;
end $$;

-- Re-open a rider job after a failed or released attempt.
create or replace function public.partner_request_rider(p_order uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o record;
begin
  perform public._uid();
  select * into o from public.orders where id = p_order for update;
  if o.id is null then perform public._fail('not_found'); end if;
  perform public._assert_owner(o.laundry_id);
  if o.status = 'accepted' and public._needs_pickup(o.fulfillment) then
    return public._open_job(p_order, 'pickup');
  elsif o.status = 'ready' and public._needs_return(o.fulfillment) then
    return public._open_job(p_order, 'return');
  end if;
  perform public._fail('invalid_transition');
  return null;
end $$;

create or replace function public.partner_adjust_price(p_order uuid, p_final_total numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  perform public._uid();
  select * into o from public.orders where id = p_order for update;
  if o.id is null then perform public._fail('not_found'); end if;
  perform public._assert_owner(o.laundry_id);
  if o.status not in ('received','processing') then perform public._fail('invalid_transition'); end if;
  if o.payment_status = 'paid' then perform public._fail('already_paid'); end if;
  if p_final_total is null or p_final_total < 0 or p_final_total > 100000 then perform public._fail('invalid_amount'); end if;
  if coalesce(trim(p_note), '') = '' then perform public._fail('note_required'); end if;
  update public.orders set final_total = round(p_final_total, 2), adjustment_note = left(p_note, 500),
    adjustment_status = 'pending' where id = p_order;
  perform public._event(p_order, o.status, 'price_adjusted', p_final_total::text, 'partner');
  perform public._notify(o.customer_id, 'price_adjusted',
    jsonb_build_object('order_number', o.order_number, 'amount', round(p_final_total, 2)), '/orders/' || p_order);
end $$;

-- Records cash/bank payment collected for an order. Unique index prevents double confirmation.
create or replace function public.partner_mark_order_paid(p_order uuid, p_method public.payment_method, p_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o record; v_amount numeric;
begin
  perform public._uid();
  select * into o from public.orders where id = p_order for update;
  if o.id is null then perform public._fail('not_found'); end if;
  perform public._assert_owner(o.laundry_id);
  if o.status in ('placed','rejected','cancelled') then perform public._fail('invalid_transition'); end if;
  if o.payment_status = 'paid' then perform public._fail('already_paid'); end if;
  if p_method = 'online' then perform public._fail('payment_method_unavailable'); end if;
  if o.adjustment_status = 'pending' then perform public._fail('adjustment_pending'); end if;
  v_amount := coalesce(case when o.adjustment_status = 'approved' then o.final_total end, o.total);
  update public.payments set status = 'failed', notes = 'superseded' where order_id = p_order and kind = 'order' and status = 'pending';
  insert into public.payments (kind, payer_id, laundry_id, order_id, amount, method, status, reference, confirmed_by, confirmed_at)
  values ('order', o.customer_id, o.laundry_id, p_order, v_amount, p_method, 'confirmed', left(p_reference, 120), auth.uid(), now());
  update public.orders set payment_status = 'paid', payment_method = p_method where id = p_order;
  perform public._event(p_order, o.status, 'payment_recorded', v_amount::text, 'partner');
end $$;

create or replace function public.partner_submit_subscription_payment(p_laundry uuid, p_method public.payment_method, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare sub record; v_id uuid;
begin
  perform public._uid();
  perform public._assert_owner(p_laundry);
  select * into sub from public.partner_subscriptions where laundry_id = p_laundry;
  if sub.id is null then perform public._fail('subscription_not_ready'); end if;
  if p_method <> 'bank_transfer' then perform public._fail('payment_method_unavailable'); end if;
  if coalesce(trim(p_reference), '') = '' then perform public._fail('reference_required'); end if;
  if exists (select 1 from public.payments where subscription_id = sub.id and status = 'pending') then
    perform public._fail('payment_already_pending');
  end if;
  insert into public.payments (kind, payer_id, laundry_id, subscription_id, amount, method, reference)
  values ('partner_subscription', auth.uid(), p_laundry, sub.id, (public.settings()).partner_subscription_price, p_method, left(p_reference, 120))
  returning id into v_id;
  perform public._notify_admins('subscription_payment_pending', jsonb_build_object('laundry_id', p_laundry), '/admin/payments');
  return v_id;
end $$;

create or replace function public.partner_reply_review(p_review uuid, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform public._uid();
  select * into r from public.reviews where id = p_review;
  if r.id is null then perform public._fail('not_found'); end if;
  perform public._assert_owner(r.laundry_id);
  update public.reviews set partner_reply = nullif(left(trim(p_reply), 1000), '') where id = p_review;
end $$;

-- ---------------------------------------------------------------------------
-- Payment confirmation (shared by admin, partner-for-own-packages, and online provider)
-- ---------------------------------------------------------------------------
create or replace function public._confirm_payment(p_payment uuid, p_reference text, p_provider_id text)
returns void language plpgsql security definer set search_path = public as $$
declare p record; sub record; s record; v_start timestamptz; v_end timestamptz; pk record;
begin
  select * into p from public.payments where id = p_payment for update;
  if p.id is null then perform public._fail('not_found'); end if;
  if p.status <> 'pending' then perform public._fail('payment_not_pending'); end if;
  select * into s from public.platform_settings where id = 1;

  if p.kind = 'partner_subscription' then
    select * into sub from public.partner_subscriptions where id = p.subscription_id for update;
    v_start := greatest(now(), coalesce(sub.current_period_end, now()));
    v_end := v_start + make_interval(months => s.billing_cycle_months);
    update public.partner_subscriptions set status = 'active',
      current_period_start = case when sub.status in ('active','past_due') and sub.current_period_end > now()
                                  then sub.current_period_start else v_start end,
      current_period_end = v_end where id = sub.id;
    update public.payments set period_start = v_start, period_end = v_end where id = p_payment;
    perform public._notify((select owner_id from public.laundries where id = p.laundry_id), 'subscription_active',
      jsonb_build_object('until', v_end), '/partner/subscription');
  elsif p.kind = 'customer_package' then
    select * into pk from public.customer_packages cp where cp.id = p.customer_package_id for update;
    if pk.status <> 'pending_payment' then perform public._fail('invalid_transition'); end if;
    update public.customer_packages set status = 'active', period_start = now(),
      period_end = now() + make_interval(days => (select interval_days from public.packages where id = pk.package_id))
    where id = pk.id;
    perform public._notify(pk.customer_id, 'package_active', '{}'::jsonb, '/account/packages');
  elsif p.kind = 'order' then
    update public.orders set payment_status = 'paid' where id = p.order_id;
  end if;

  update public.payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
    reference = coalesce(nullif(p_reference, ''), reference),
    provider_payment_id = coalesce(p_provider_id, provider_payment_id),
    invoice_number = 'INV-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')
  where id = p_payment;
end $$;
revoke execute on function public._confirm_payment(uuid, text, text) from public, anon, authenticated;

-- Partner confirms cash/bank payment for their own customer packages.
create or replace function public.partner_confirm_package_payment(p_payment uuid, p_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  perform public._uid();
  select * into p from public.payments where id = p_payment;
  if p.id is null or p.kind <> 'customer_package' then perform public._fail('not_found'); end if;
  perform public._assert_owner(p.laundry_id);
  perform public._confirm_payment(p_payment, p_reference, null);
end $$;

-- ---------------------------------------------------------------------------
-- Rider actions
-- ---------------------------------------------------------------------------
create or replace function public._active_rider() returns public.riders
language plpgsql security definer set search_path = public as $$
declare r public.riders;
begin
  select * into r from public.riders where id = auth.uid();
  if r.id is null or r.status <> 'active' then perform public._fail('rider_not_active'); end if;
  return r;
end $$;
revoke execute on function public._active_rider() from public, anon, authenticated;

create or replace function public.rider_set_online(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.riders := public._active_rider();
begin
  update public.riders set is_online = p_online,
    last_lat = coalesce(p_lat, last_lat), last_lng = coalesce(p_lng, last_lng), last_seen_at = now()
  where id = r.id;
end $$;

-- Open jobs in the rider's city: area-level info only until claimed.
create or replace function public.rider_open_jobs()
returns table (id uuid, order_number text, leg public.job_leg, from_area text, to_area text,
               distance_km double precision, rider_fee numeric, window_start timestamptz, window_end timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare r public.riders := public._active_rider();
begin
  return query
  select j.id, j.order_number, j.leg, j.from_area, j.to_area,
    case when r.last_lat is null or j.from_lat is null then null
         else 6371 * 2 * asin(sqrt(power(sin(radians(j.from_lat - r.last_lat) / 2), 2) +
              cos(radians(r.last_lat)) * cos(radians(j.from_lat)) * power(sin(radians(j.from_lng - r.last_lng) / 2), 2)))
    end,
    j.rider_fee, o.window_start, o.window_end, j.created_at
  from public.delivery_jobs j join public.orders o on o.id = j.order_id
  where j.status = 'open' and j.city_id = r.city_id
  order by 6 nulls last, j.created_at
  limit 50;
end $$;

create or replace function public._assign_job(p_job uuid, p_rider uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare j record; o record;
begin
  select * into j from public.delivery_jobs where id = p_job for update;
  if j.id is null then perform public._fail('not_found'); end if;
  if j.status <> 'open' then perform public._fail('job_taken'); end if;
  if (select count(*) from public.delivery_jobs where rider_id = p_rider and status in ('assigned','picked_up'))
     >= (public.settings()).max_active_jobs_per_rider then
    perform public._fail('rider_at_capacity');
  end if;
  update public.delivery_jobs set status = 'assigned', rider_id = p_rider, assigned_at = now() where id = p_job;
  select * into o from public.orders where id = j.order_id for update;
  if j.leg = 'pickup' and o.status = 'accepted' then
    perform public._set_status(o.id, 'pickup_assigned', 'rider_assigned', null, p_role);
  elsif j.leg = 'return' and o.status = 'ready' then
    perform public._set_status(o.id, 'return_assigned', 'rider_assigned', null, p_role);
  end if;
  perform public._notify(p_rider, 'job_assigned', jsonb_build_object('order_number', j.order_number), '/rider/jobs/' || p_job);
end $$;
revoke execute on function public._assign_job(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.rider_claim_job(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.riders := public._active_rider();
begin
  if not r.is_online then perform public._fail('rider_offline'); end if;
  if not exists (select 1 from public.delivery_jobs where id = p_job and city_id = r.city_id) then
    perform public._fail('not_found');
  end if;
  perform public._assign_job(p_job, r.id, 'rider');
end $$;

-- Rider releases a job before picking anything up.
create or replace function public.rider_release_job(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.riders := public._active_rider(); j record;
begin
  select * into j from public.delivery_jobs where id = p_job and rider_id = r.id for update;
  if j.id is null or j.status <> 'assigned' then perform public._fail('invalid_transition'); end if;
  update public.delivery_jobs set status = 'open', rider_id = null, assigned_at = null where id = p_job;
  perform public._set_status(j.order_id, case when j.leg = 'pickup' then 'accepted' else 'ready' end::public.order_status,
    'rider_released', null, 'rider');
end $$;

-- Pickup leg: rider collects from the customer, verified by the customer's pickup code.
create or replace function public.rider_confirm_pickup(p_job uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.riders := public._active_rider(); j record; sec record;
begin
  select * into j from public.delivery_jobs where id = p_job and rider_id = r.id for update;
  if j.id is null or j.leg <> 'pickup' or j.status <> 'assigned' then perform public._fail('invalid_transition'); end if;
  select * into sec from public.order_secrets where order_id = j.order_id for update;
  if sec.failed_attempts >= 5 then perform public._fail('code_locked'); end if;
  if p_code is distinct from sec.pickup_code then
    update public.order_secrets set failed_attempts = failed_attempts + 1 where order_id = j.order_id;
    perform public._fail('invalid_code');
  end if;
  update public.order_secrets set failed_attempts = 0 where order_id = j.order_id;
  update public.delivery_jobs set status = 'picked_up', picked_up_at = now() where id = p_job;
  perform public._set_status(j.order_id, 'picked_up', 'picked_up', null, 'rider');
  perform public._notify((select l.owner_id from public.orders o join public.laundries l on l.id = o.laundry_id where o.id = j.order_id),
    'rider_on_the_way', jsonb_build_object('order_number', j.order_number), '/partner/orders/' || j.order_id);
end $$;

-- Return leg: rider hands over to the customer, verified by the customer's delivery code.
create or replace function public.rider_confirm_delivery(p_job uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.riders := public._active_rider(); j record; sec record;
begin
  select * into j from public.delivery_jobs where id = p_job and rider_id = r.id for update;
  if j.id is null or j.leg <> 'return' or j.status <> 'picked_up' then perform public._fail('invalid_transition'); end if;
  select * into sec from public.order_secrets where order_id = j.order_id for update;
  if sec.failed_attempts >= 5 then perform public._fail('code_locked'); end if;
  if p_code is distinct from sec.delivery_code then
    update public.order_secrets set failed_attempts = failed_attempts + 1 where order_id = j.order_id;
    perform public._fail('invalid_code');
  end if;
  update public.order_secrets set failed_attempts = 0 where order_id = j.order_id;
  update public.delivery_jobs set status = 'delivered', delivered_at = now() where id = p_job;
  perform public._set_status(j.order_id, 'delivered', 'delivered', null, 'rider');
end $$;

create or replace function public.rider_fail_job(p_job uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.riders := public._active_rider(); j record; o record;
begin
  if coalesce(trim(p_reason), '') = '' then perform public._fail('reason_required'); end if;
  select * into j from public.delivery_jobs where id = p_job and rider_id = r.id for update;
  if j.id is null or j.status not in ('assigned','picked_up') then perform public._fail('invalid_transition'); end if;
  -- A pickup-leg bag already collected cannot be "failed"; it must reach the laundry.
  if j.leg = 'pickup' and j.status = 'picked_up' then perform public._fail('invalid_transition'); end if;
  update public.delivery_jobs set status = 'failed', fail_reason = left(p_reason, 300) where id = p_job;
  select * into o from public.orders where id = j.order_id for update;
  -- Failed return: bag goes back to the laundry; order returns to "ready" for a new attempt.
  perform public._set_status(o.id, case when j.leg = 'pickup' then 'accepted' else 'ready' end::public.order_status,
    case when j.leg = 'pickup' then 'pickup_failed' else 'delivery_failed' end, p_reason, 'rider');
  perform public._notify((select owner_id from public.laundries where id = o.laundry_id), 'delivery_failed',
    jsonb_build_object('order_number', o.order_number, 'reason', p_reason), '/partner/orders/' || o.id);
  perform public._notify_admins('delivery_failed', jsonb_build_object('order_number', o.order_number), '/admin/orders/' || o.id);
end $$;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------
create or replace function public._assert_admin() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public._fail('forbidden'); end if;
end $$;
revoke execute on function public._assert_admin() from public, anon, authenticated;

create or replace function public.admin_review_laundry(p_laundry uuid, p_status public.laundry_status, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l record; s record;
begin
  perform public._assert_admin();
  if p_status not in ('under_review','approved','rejected','info_required') then perform public._fail('invalid_transition'); end if;
  select * into l from public.laundries where id = p_laundry for update;
  if l.id is null then perform public._fail('not_found'); end if;
  if l.status = 'draft' then perform public._fail('not_submitted'); end if;
  if p_status in ('rejected','info_required') and coalesce(trim(p_notes), '') = '' then perform public._fail('note_required'); end if;
  select * into s from public.platform_settings where id = 1;
  update public.laundries set status = p_status, review_notes = p_notes,
    approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
  where id = p_laundry;
  if p_status = 'approved' and not exists (select 1 from public.partner_subscriptions where laundry_id = p_laundry) then
    insert into public.partner_subscriptions (laundry_id, status, price, current_period_start, current_period_end, trial_used)
    values (p_laundry,
            case when s.trial_days > 0 then 'active' else 'pending' end::public.subscription_status,
            s.partner_subscription_price,
            case when s.trial_days > 0 then now() end,
            case when s.trial_days > 0 then now() + make_interval(days => s.trial_days) end,
            s.trial_days > 0);
  end if;
  perform public._notify(l.owner_id, 'laundry_review', jsonb_build_object('status', p_status, 'notes', p_notes), '/partner');
end $$;

create or replace function public.admin_set_laundry_active(p_laundry uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_admin();
  update public.laundries set is_active = p_active where id = p_laundry;
end $$;

create or replace function public.admin_review_rider(p_rider uuid, p_status public.rider_status, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_admin();
  update public.riders set status = p_status, review_notes = p_notes,
    is_online = case when p_status = 'active' then is_online else false end
  where id = p_rider;
  if not found then perform public._fail('not_found'); end if;
  perform public._notify(p_rider, 'rider_review', jsonb_build_object('status', p_status, 'notes', p_notes), '/rider');
end $$;

create or replace function public.admin_confirm_payment(p_payment uuid, p_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_admin();
  perform public._confirm_payment(p_payment, p_reference, null);
end $$;

create or replace function public.admin_reject_payment(p_payment uuid, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  perform public._assert_admin();
  select * into p from public.payments where id = p_payment for update;
  if p.id is null or p.status <> 'pending' then perform public._fail('payment_not_pending'); end if;
  update public.payments set status = 'failed', notes = p_notes, confirmed_by = auth.uid(), confirmed_at = now() where id = p_payment;
  perform public._notify(p.payer_id, 'payment_rejected', jsonb_build_object('notes', p_notes), null);
end $$;

-- Records a subscription payment received outside the app (e.g. bank transfer seen on statement).
create or replace function public.admin_record_subscription_payment(p_laundry uuid, p_method public.payment_method, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare sub record; v_id uuid;
begin
  perform public._assert_admin();
  select * into sub from public.partner_subscriptions where laundry_id = p_laundry;
  if sub.id is null then perform public._fail('subscription_not_ready'); end if;
  if coalesce(trim(p_reference), '') = '' then perform public._fail('reference_required'); end if;
  insert into public.payments (kind, payer_id, laundry_id, subscription_id, amount, method, reference)
  values ('partner_subscription', (select owner_id from public.laundries where id = p_laundry), p_laundry, sub.id,
          (public.settings()).partner_subscription_price, p_method, p_reference)
  returning id into v_id;
  perform public._confirm_payment(v_id, p_reference, null);
  return v_id;
end $$;

create or replace function public.admin_set_subscription_status(p_sub uuid, p_status public.subscription_status, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_admin();
  if p_status not in ('suspended','cancelled','active','expired') then perform public._fail('invalid_transition'); end if;
  if p_status = 'active' and not exists (select 1 from public.partner_subscriptions
                                         where id = p_sub and current_period_end > now()) then
    -- Reactivation without a paid period is not allowed; record a payment instead.
    perform public._fail('no_paid_period');
  end if;
  update public.partner_subscriptions set status = p_status, notes = coalesce(p_notes, notes) where id = p_sub;
  if not found then perform public._fail('not_found'); end if;
end $$;

create or replace function public.admin_assign_job(p_job uuid, p_rider uuid)
returns void language plpgsql security definer set search_path = public as $$
declare j record;
begin
  perform public._assert_admin();
  if not exists (select 1 from public.riders where id = p_rider and status = 'active') then perform public._fail('rider_not_active'); end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if j.id is null then perform public._fail('not_found'); end if;
  -- Reassignment of a not-yet-picked-up job: reopen first.
  if j.status = 'assigned' then
    update public.delivery_jobs set status = 'open', rider_id = null where id = p_job;
    perform public._notify(j.rider_id, 'job_unassigned', jsonb_build_object('order_number', j.order_number), '/rider');
  end if;
  perform public._assign_job(p_job, p_rider, 'admin');
end $$;

create or replace function public.admin_open_job(p_order uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o record;
begin
  perform public._assert_admin();
  select * into o from public.orders where id = p_order for update;
  if o.status = 'accepted' and public._needs_pickup(o.fulfillment) then return public._open_job(p_order, 'pickup'); end if;
  if o.status = 'ready' and public._needs_return(o.fulfillment) then return public._open_job(p_order, 'return'); end if;
  perform public._fail('invalid_transition');
  return null;
end $$;

create or replace function public.admin_cancel_order(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  perform public._assert_admin();
  if coalesce(trim(p_reason), '') = '' then perform public._fail('reason_required'); end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then perform public._fail('not_found'); end if;
  if o.status in ('completed','cancelled','rejected') then perform public._fail('invalid_transition'); end if;
  update public.orders set cancellation_reason = p_reason, cancelled_by = auth.uid() where id = p_order;
  perform public._cancel_live_jobs(p_order);
  perform public._release_package(p_order);
  perform public._refund_if_paid(p_order, 'cancelled_by_admin');
  perform public._set_status(p_order, 'cancelled', 'cancelled_by_admin', p_reason, 'admin');
end $$;

create or replace function public.admin_create_refund(p_order uuid, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare p record; v_id uuid; v_refunded numeric;
begin
  perform public._assert_admin();
  select * into p from public.payments where order_id = p_order and kind = 'order' and status = 'confirmed';
  if p.id is null then perform public._fail('no_confirmed_payment'); end if;
  select coalesce(sum(amount), 0) into v_refunded from public.refunds where order_id = p_order and status <> 'rejected';
  if p_amount <= 0 or p_amount + v_refunded > p.amount then perform public._fail('invalid_amount'); end if;
  insert into public.refunds (order_id, payment_id, amount, reason) values (p_order, p.id, p_amount, p_reason) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_process_refund(p_refund uuid, p_status public.refund_status)
returns void language plpgsql security definer set search_path = public as $$
declare r record; p record; v_total numeric;
begin
  perform public._assert_admin();
  if p_status not in ('processed','rejected') then perform public._fail('invalid_transition'); end if;
  select * into r from public.refunds where id = p_refund for update;
  if r.id is null or r.status <> 'pending' then perform public._fail('invalid_transition'); end if;
  update public.refunds set status = p_status, processed_by = auth.uid(), processed_at = now() where id = p_refund;
  if p_status = 'processed' then
    select * into p from public.payments where id = r.payment_id;
    select coalesce(sum(amount), 0) into v_total from public.refunds where order_id = r.order_id and status = 'processed';
    update public.orders set payment_status = (case when v_total >= p.amount then 'refunded' else 'partially_refunded' end)::public.order_payment_status
      where id = r.order_id;
    if v_total >= p.amount then
      update public.payments set status = 'refunded' where id = p.id;
    end if;
    perform public._notify((select customer_id from public.orders where id = r.order_id), 'refund_processed',
      jsonb_build_object('amount', r.amount), '/orders/' || r.order_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduled maintenance (cron / service role only)
-- ---------------------------------------------------------------------------
create or replace function public.run_maintenance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s record; o record; v_expired int := 0; v_completed int := 0;
begin
  select * into s from public.platform_settings where id = 1;

  -- 1. Orders not accepted in time are cancelled (customer notified, credits released, refund opened if paid).
  for o in select * from public.orders where status = 'placed' and accept_deadline < now() for update skip locked loop
    update public.orders set cancellation_reason = 'accept_timeout' where id = o.id;
    perform public._release_package(o.id);
    perform public._refund_if_paid(o.id, 'accept_timeout');
    perform public._set_status(o.id, 'cancelled', 'accept_timeout', null, 'system');
    v_expired := v_expired + 1;
  end loop;

  -- 2. Delivered orders auto-complete after the configured window.
  for o in select id from public.orders where status = 'delivered'
             and delivered_at < now() - make_interval(hours => s.auto_complete_hours) for update skip locked loop
    perform public._complete_order(o.id, 'system');
    v_completed := v_completed + 1;
  end loop;

  -- 3. Partner subscription lifecycle.
  update public.partner_subscriptions set status = 'past_due'
    where status = 'active' and current_period_end < now();
  update public.partner_subscriptions set status = 'expired'
    where status = 'past_due' and current_period_end + make_interval(days => s.grace_days) < now();

  -- 4. Renewal reminders 3 days before period end (once per period).
  insert into public.notifications (user_id, kind, data, link)
  select l.owner_id, 'subscription_renewal_due', jsonb_build_object('until', ps.current_period_end, 'laundry', l.name), '/partner/subscription'
  from public.partner_subscriptions ps join public.laundries l on l.id = ps.laundry_id
  where ps.status = 'active' and ps.current_period_end between now() and now() + interval '3 days'
    and not exists (select 1 from public.notifications n where n.user_id = l.owner_id and n.kind = 'subscription_renewal_due'
                    and n.data->>'until' = to_jsonb(ps.current_period_end) #>> '{}' and n.created_at > now() - interval '5 days');

  -- 5. Customer packages past their period.
  update public.customer_packages set status = 'expired'
    where status in ('active','exhausted') and period_end < now();

  return jsonb_build_object('expired_orders', v_expired, 'auto_completed', v_completed, 'ran_at', now());
end $$;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

-- Online payment provider callback (server verifies with the provider first, then calls this with the service role).
create or replace function public.system_confirm_online_payment(p_payment uuid, p_provider text, p_provider_id text, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from public.payments where id = p_payment;
  if p.id is null then perform public._fail('not_found'); end if;
  if p.status = 'confirmed' and p.provider_payment_id = p_provider_id then return; end if; -- idempotent
  if p.method <> 'online' then perform public._fail('invalid_method'); end if;
  if p_amount <> p.amount then perform public._fail('amount_mismatch'); end if;
  update public.payments set provider = p_provider where id = p_payment;
  perform public._confirm_payment(p_payment, p_provider_id, p_provider_id);
end $$;
revoke execute on function public.system_confirm_online_payment(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.system_confirm_online_payment(uuid, text, text, numeric) to service_role;

-- Creates a pending online subscription payment before redirecting to the provider.
create or replace function public.partner_start_online_subscription_payment(p_laundry uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sub record; v_id uuid; v_amount numeric := (public.settings()).partner_subscription_price;
begin
  perform public._uid();
  perform public._assert_owner(p_laundry);
  select * into sub from public.partner_subscriptions where laundry_id = p_laundry;
  if sub.id is null then perform public._fail('subscription_not_ready'); end if;
  update public.payments set status = 'failed', notes = 'superseded'
    where subscription_id = sub.id and status = 'pending' and method = 'online';
  if exists (select 1 from public.payments where subscription_id = sub.id and status = 'pending') then
    perform public._fail('payment_already_pending');
  end if;
  insert into public.payments (kind, payer_id, laundry_id, subscription_id, amount, method)
  values ('partner_subscription', auth.uid(), p_laundry, sub.id, v_amount, 'online') returning id into v_id;
  return jsonb_build_object('payment_id', v_id, 'amount', v_amount);
end $$;
