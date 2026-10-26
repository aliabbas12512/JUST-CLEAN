-- Packages (credits + overage), promo codes, cancellation, refunds, failed delivery, admin reassignment.
-- Builds on state from 10_order_lifecycle.sql (same session database).

\set admin    '''00000000-0000-0000-0000-00000000000a'''
\set partner  '''00000000-0000-0000-0000-00000000000b'''
\set customer '''00000000-0000-0000-0000-00000000000d'''
\set rider    '''00000000-0000-0000-0000-00000000000e'''

create function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error % but statement succeeded: %', p_code, p_sql;
exception when others then
  if sqlerrm not like '%' || p_code || '%' then
    raise exception 'expected error % but got: %', p_code, sqlerrm;
  end if;
end $$;
create function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'CHECK FAILED: %', p_msg; end if;
end $$;
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;
insert into ctx select 'laundry', id::text from public.laundries limit 1;
insert into ctx select 'svc_piece', id::text from public.services where pricing_model = 'per_piece';

-- Reactivate the subscription for this test file.
update public.partner_subscriptions set status = 'active', current_period_end = now() + interval '20 days';

-- ---------------------------------------------------------------- partner defines a package
select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
insert into public.packages (laundry_id, name_ar, price, piece_credits, max_orders, free_pickup_delivery, terms)
values ((select v::uuid from ctx where k = 'laundry'), 'باقة شهرية', 120, 5, 4, true, 'Valid 30 days. No refunds after first use.');
insert into ctx select 'package', id::text from public.packages;
reset role;

-- ---------------------------------------------------------------- customer buys it (pending until paid)
select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
insert into ctx select 'cp', public.purchase_package((select v::uuid from ctx where k = 'package'), 'cash')::text;
select pg_temp.check((select status from public.customer_packages) = 'pending_payment', 'package not active before payment');
select pg_temp.expect_error('select public.purchase_package((select v::uuid from ctx where k = ''package''), ''cash'')', 'package_already_owned');
select pg_temp.check(
  (public.quote_order((select v::uuid from ctx where k = 'laundry'), 'pickup_delivery',
     jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 2)),
     null, (select v::uuid from ctx where k = 'cp'))->'errors') ? 'package_invalid',
  'unpaid package cannot be used');
reset role;

select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
select public.partner_confirm_package_payment((select id from public.payments where customer_package_id = (select v::uuid from ctx where k = 'cp')));
reset role;

select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
select pg_temp.check((select status from public.customer_packages) = 'active', 'package active after payment');
-- 7 pieces with 5 credits: 5 covered, 2 charged at 5 SAR, pickup/delivery free.
select pg_temp.check(
  (public.quote_order((select v::uuid from ctx where k = 'laundry'), 'pickup_delivery',
     jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 7)),
     null, (select v::uuid from ctx where k = 'cp'))->>'total')::numeric = 10,
  'overage charged beyond credits, fees waived');
insert into ctx select 'pkg_order', (public.place_order('44444444-4444-4444-4444-444444444444', (select v::uuid from ctx where k = 'laundry'),
  'pickup_delivery', jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 7)),
  '{"name":"Customer","phone":"966500000004"}', jsonb_build_object('city_id', 2, 'line', 'Street 1'),
  null, null, null, null, (select v::uuid from ctx where k = 'cp')))->>'id';
select pg_temp.check((select pieces_used from public.customer_packages) = 5, 'credits consumed');
select pg_temp.check((select status from public.customer_packages) = 'exhausted', 'package exhausted');
select public.cancel_order((select v::uuid from ctx where k = 'pkg_order'), 'changed mind');
select pg_temp.check((select pieces_used from public.customer_packages) = 0, 'credits restored on cancel');
select pg_temp.check((select status from public.customer_packages) = 'active', 'package active again');
reset role;

-- ---------------------------------------------------------------- promo codes
select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
insert into public.promo_codes (code, discount_type, discount_value, max_discount, per_user_limit)
values ('WELCOME10', 'percent', 10, 3, 1);
reset role;

select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
select pg_temp.check((select count(*) from public.promo_codes) = 0, 'customers cannot list promo codes');
select pg_temp.check(
  (public.quote_order((select v::uuid from ctx where k = 'laundry'), 'dropoff',
     jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 10)), 'welcome10')->>'discount')::numeric = 3,
  'percent discount capped by max_discount');
insert into ctx select 'promo_order', (public.place_order('55555555-5555-5555-5555-555555555555', (select v::uuid from ctx where k = 'laundry'),
  'pickup_delivery', jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 10)),
  '{"name":"Customer","phone":"966500000004"}', jsonb_build_object('city_id', 2, 'line', 'Street 1'), null, null, null, 'WELCOME10'))->>'id';
select pg_temp.check((select total from public.orders where id = (select v::uuid from ctx where k = 'promo_order')) = 62, '50 - 3 + 7 + 8');
select pg_temp.check(
  (public.quote_order((select v::uuid from ctx where k = 'laundry'), 'dropoff',
     jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 10)), 'WELCOME10')->'errors') ? 'promo_used',
  'per-user promo limit enforced');
reset role;

-- ---------------------------------------------------------------- failed return delivery + admin reassignment
select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
select public.partner_respond_order((select v::uuid from ctx where k = 'promo_order'), true);
reset role;
insert into ctx select 'pcode', pickup_code from public.order_secrets where order_id = (select v::uuid from ctx where k = 'promo_order');
select set_config('request.jwt.claim.sub', :rider, false);
set role authenticated;
select pg_temp.check((select count(*) from public.order_secrets) = 0, 'rider cannot read handover codes');
select public.rider_claim_job((select id from public.rider_open_jobs() limit 1));
select public.rider_confirm_pickup((select id from public.delivery_jobs where rider_id = :rider and status = 'assigned'),
  (select v from ctx where k = 'pcode'));
reset role;
select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
select public.partner_advance_order((select v::uuid from ctx where k = 'promo_order'), 'received');
select public.partner_advance_order((select v::uuid from ctx where k = 'promo_order'), 'processing');
select public.partner_advance_order((select v::uuid from ctx where k = 'promo_order'), 'ready');
select public.partner_mark_order_paid((select v::uuid from ctx where k = 'promo_order'), 'bank_transfer', 'TRX-9');
reset role;
select set_config('request.jwt.claim.sub', :rider, false);
set role authenticated;
select public.rider_claim_job((select id from public.rider_open_jobs() limit 1));
select public.rider_fail_job((select id from public.delivery_jobs where rider_id = :rider and status = 'assigned'), 'Customer not answering');
reset role;
select pg_temp.check((select status from public.orders where id = (select v::uuid from ctx where k = 'promo_order')) = 'ready', 'order back to ready after failed delivery');

select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
insert into ctx select 'job3', public.admin_open_job((select v::uuid from ctx where k = 'promo_order'))::text;
select public.admin_assign_job((select v::uuid from ctx where k = 'job3'), :rider);
select pg_temp.check((select status from public.orders where id = (select v::uuid from ctx where k = 'promo_order')) = 'return_assigned', 'admin reassigned');

-- ---------------------------------------------------------------- admin cancels a paid order -> refund
select public.admin_cancel_order((select v::uuid from ctx where k = 'promo_order'), 'Customer unreachable');
select pg_temp.check((select count(*) from public.refunds where status = 'pending') = 1, 'refund opened for paid cancelled order');
select pg_temp.check((select status from public.delivery_jobs where id = (select v::uuid from ctx where k = 'job3')) = 'cancelled', 'live job cancelled');
select public.admin_process_refund((select id from public.refunds limit 1), 'processed');
select pg_temp.check((select payment_status from public.orders where id = (select v::uuid from ctx where k = 'promo_order')) = 'refunded', 'order refunded');
select pg_temp.expect_error($$select public.admin_create_refund((select v::uuid from ctx where k = 'promo_order'), 1, 'extra')$$, 'no_confirmed_payment');
reset role;
\echo 'packages/promos/refunds: OK'
