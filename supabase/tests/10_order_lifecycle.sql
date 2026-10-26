-- End-to-end workflow: registration -> approval -> subscription -> order -> two-leg delivery -> review.
-- Runs as different roles by switching request.jwt.claim.sub + SET ROLE, like PostgREST does.

\set admin    '''00000000-0000-0000-0000-00000000000a'''
\set partner  '''00000000-0000-0000-0000-00000000000b'''
\set other    '''00000000-0000-0000-0000-00000000000c'''
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

insert into auth.users (id, phone, email) values
  (:admin, '966500000001', null), (:partner, '966500000002', null), (:other, '966500000003', null),
  (:customer, '966500000004', null), (:rider, '966500000005', null);
update public.profiles set is_admin = true where id = :admin;
select pg_temp.check((select count(*) from public.profiles) = 5, 'profiles created by trigger');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- ---------------------------------------------------------------- partner registers
select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;

insert into public.laundries (owner_id, name, representative_name, phone, city_id, address, lat, lng, status,
                              pickup_fee, delivery_fee, min_order, terms_accepted_at, service_radius_km)
values (:partner, 'مغسلة الاختبار', 'Owner', '966500000002', (select id from public.cities where slug = 'khobar'),
        'King Fahd Rd', 26.2172, 50.1971, 'approved', 7, 8, 0, now(), 10);
insert into ctx select 'laundry', id::text from public.laundries where owner_id = :partner;
select pg_temp.check((select status from public.laundries where owner_id = :partner) = 'draft', 'guard forces draft on insert');

-- try to escalate
update public.laundries set status = 'approved', rating_avg = 5 where owner_id = :partner;
select pg_temp.check((select status from public.laundries where owner_id = :partner) = 'draft', 'guard blocks status update');
update public.profiles set is_admin = true where id = :partner;
select pg_temp.check(not (select is_admin from public.profiles where id = :partner), 'cannot self-promote to admin');

insert into public.services (laundry_id, category_id, name_ar, pricing_model, price)
select (select v::uuid from ctx where k = 'laundry'), c.id, x.n, x.m::public.pricing_model, x.p
from (values ('thobe','غسيل ثوب','per_piece',5.00), ('wash','غسيل بالكيلو','per_kg',10.00), ('curtains','ستائر','quote',null))
  as x(cat, n, m, p) join public.service_categories c on c.slug = x.cat;
insert into ctx select 'svc_piece', id::text from public.services where pricing_model = 'per_piece';
insert into ctx select 'svc_kg', id::text from public.services where pricing_model = 'per_kg';

select public.submit_laundry((select v::uuid from ctx where k = 'laundry'));
reset role;

-- ---------------------------------------------------------------- other partner cannot touch it
select set_config('request.jwt.claim.sub', :other, false);
set role authenticated;
select pg_temp.check((select count(*) from public.laundries) = 0, 'other partner cannot see unapproved laundry');
select pg_temp.check((select count(*) from public.services) = 0, 'other partner cannot see draft services');
reset role;

-- ---------------------------------------------------------------- not yet searchable
select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
select pg_temp.check((select count(*) from public.nearby_laundries(26.22, 50.20)) = 0, 'unapproved laundry hidden');
select pg_temp.expect_error('select public.admin_review_laundry((select v::uuid from ctx where k = ''laundry''), ''approved'')', 'forbidden');
reset role;

-- ---------------------------------------------------------------- admin approves
select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
select public.admin_review_laundry((select v::uuid from ctx where k = 'laundry'), 'approved', null);
select pg_temp.check((select status from public.partner_subscriptions) = 'pending', 'subscription pending after approval (no trial)');
reset role;

select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
select pg_temp.check((select count(*) from public.nearby_laundries(26.22, 50.20)) = 0, 'unpaid subscription hides laundry');
reset role;

-- ---------------------------------------------------------------- subscription payment (manual)
select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
insert into ctx select 'sub_payment', public.partner_submit_subscription_payment((select v::uuid from ctx where k = 'laundry'), 'bank_transfer', 'TRX-1')::text;
select pg_temp.expect_error('select public.partner_submit_subscription_payment((select v::uuid from ctx where k = ''laundry''), ''bank_transfer'', ''TRX-2'')', 'payment_already_pending');
select pg_temp.check((select status from public.partner_subscriptions) = 'pending', 'still pending before admin confirms');
reset role;

select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
select public.admin_confirm_payment((select v::uuid from ctx where k = 'sub_payment'), null);
select pg_temp.check((select status from public.partner_subscriptions) = 'active', 'subscription active after confirmation');
select pg_temp.check((select amount from public.payments where kind = 'partner_subscription') = 100.00, 'SAR 100 charged');
select pg_temp.check((select invoice_number from public.payments where kind = 'partner_subscription') like 'INV-%', 'invoice number issued');
select pg_temp.expect_error('select public.admin_confirm_payment((select v::uuid from ctx where k = ''sub_payment''), null)', 'payment_not_pending');
reset role;

-- ---------------------------------------------------------------- customer orders
select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
select pg_temp.check((select count(*) from public.nearby_laundries(26.22, 50.20)) = 1, 'active laundry visible nearby');
select pg_temp.check((select count(*) from public.nearby_laundries(24.71, 46.67)) = 0, 'not visible from Riyadh');
select pg_temp.check((select round(distance_km::numeric, 1) from public.nearby_laundries(26.2172, 50.1971)) = 0, 'distance computed');

select pg_temp.check(
  (public.quote_order((select v::uuid from ctx where k = 'laundry'), 'pickup_delivery',
     jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 4)))->>'total')::numeric = 35,
  'quote = 4*5 + 7 pickup + 8 delivery');
select pg_temp.check(
  (public.quote_order((select v::uuid from ctx where k = 'laundry'), 'pickup_delivery',
     jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_kg'), 'quantity', 2.5)))->>'is_estimate')::boolean,
  'per-kg order is an estimate');
select pg_temp.check(
  (public.quote_order((select v::uuid from ctx where k = 'laundry'), 'pickup_delivery',
     jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 1.5)))->'errors') ? 'invalid_quantity',
  'fractional piece quantity rejected');

insert into ctx select 'order', (public.place_order('11111111-1111-1111-1111-111111111111', (select v::uuid from ctx where k = 'laundry'),
  'pickup_delivery', jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 4, 'unit_price', 0.01)),
  '{"name":"Customer","phone":"966500000004"}', jsonb_build_object('city_id', (select id from public.cities where slug='khobar'), 'line', 'Street 1', 'lat', 26.22, 'lng', 50.2)
  ))->>'id';
select pg_temp.check((select total from public.orders) = 35, 'client-supplied unit_price ignored; server price used');
select pg_temp.check((select order_number from public.orders) ~ '^JC-[0-9]{4}-[0-9]{6}$', 'order number format');
select pg_temp.check(((public.place_order('11111111-1111-1111-1111-111111111111', (select v::uuid from ctx where k = 'laundry'),
  'pickup_delivery', '[]', '{"name":"Customer","phone":"966500000004"}', '{"city_id":1,"line":"x"}'))->>'duplicate')::boolean,
  'resubmitting same client token returns the existing order');
select pg_temp.check((select count(*) from public.orders) = 1, 'no duplicate order');
select pg_temp.check((select count(*) from public.order_secrets) = 1, 'customer can read own handover codes');
insert into ctx select 'pickup_code', pickup_code from public.order_secrets;
insert into ctx select 'delivery_code', delivery_code from public.order_secrets;
reset role;

-- ---------------------------------------------------------------- isolation
select set_config('request.jwt.claim.sub', :other, false);
set role authenticated;
select pg_temp.check((select count(*) from public.orders) = 0, 'other partner cannot see order');
select pg_temp.expect_error('select public.partner_respond_order((select v::uuid from ctx where k = ''order''), true)', 'forbidden');
reset role;

-- ---------------------------------------------------------------- partner accepts
select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
select pg_temp.check((select count(*) from public.orders) = 1, 'partner sees own order');
select pg_temp.check((select count(*) from public.order_secrets) = 0, 'partner cannot read handover codes');
select public.partner_respond_order((select v::uuid from ctx where k = 'order'), true);
select pg_temp.check((select count(*) from public.delivery_jobs where leg = 'pickup' and status = 'open') = 1, 'pickup job opened');
select pg_temp.expect_error('select public.partner_advance_order((select v::uuid from ctx where k = ''order''), ''ready'')', 'invalid_transition');
reset role;

-- ---------------------------------------------------------------- rider onboarding
select set_config('request.jwt.claim.sub', :rider, false);
set role authenticated;
insert into public.riders (id, full_name, phone, city_id, vehicle_type, status)
values (:rider, 'Rider', '966500000005', (select id from public.cities where slug = 'khobar'), 'motorcycle', 'active');
select pg_temp.check((select status from public.riders) = 'pending', 'rider forced to pending');
select pg_temp.expect_error('select public.rider_open_jobs()', 'rider_not_active');
reset role;

select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
select public.admin_review_rider(:rider, 'active', null);
reset role;

-- ---------------------------------------------------------------- leg 1: customer -> laundry
select set_config('request.jwt.claim.sub', :rider, false);
set role authenticated;
select pg_temp.check((select count(*) from public.orders) = 0, 'rider cannot see order before claiming');
select public.rider_set_online(true, 26.21, 50.19);
select pg_temp.check((select count(*) from public.rider_open_jobs()) = 1, 'rider sees open job');
insert into ctx select 'job1', id::text from public.rider_open_jobs();
select public.rider_claim_job((select v::uuid from ctx where k = 'job1'));
select pg_temp.check((select count(*) from public.orders) = 1, 'assigned rider can see order');
select pg_temp.check((select status from public.orders) = 'pickup_assigned', 'order pickup_assigned');
select pg_temp.expect_error('select public.rider_confirm_pickup((select v::uuid from ctx where k = ''job1''), ''0000'')', 'invalid_code');
select public.rider_confirm_pickup((select v::uuid from ctx where k = 'job1'), (select v from ctx where k = 'pickup_code'));
select pg_temp.check((select status from public.orders) = 'picked_up', 'order picked_up');
reset role;

select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
select pg_temp.expect_error('select public.cancel_order((select v::uuid from ctx where k = ''order''))', 'cannot_cancel');
reset role;

-- ---------------------------------------------------------------- laundry processes
select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
select public.partner_advance_order((select v::uuid from ctx where k = 'order'), 'received');
select pg_temp.check((select status from public.delivery_jobs where leg = 'pickup') = 'delivered', 'pickup leg closed on receipt');
select public.partner_advance_order((select v::uuid from ctx where k = 'order'), 'processing');
select public.partner_adjust_price((select v::uuid from ctx where k = 'order'), 40, 'Extra stain treatment');
select pg_temp.expect_error('select public.partner_advance_order((select v::uuid from ctx where k = ''order''), ''ready'')', 'adjustment_pending');
reset role;

select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
select public.respond_price_adjustment((select v::uuid from ctx where k = 'order'), true);
reset role;

select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
select public.partner_advance_order((select v::uuid from ctx where k = 'order'), 'ready');
select pg_temp.check((select count(*) from public.delivery_jobs where leg = 'return' and status = 'open') = 1, 'return job opened');
reset role;

-- ---------------------------------------------------------------- leg 2: laundry -> customer
select set_config('request.jwt.claim.sub', :rider, false);
set role authenticated;
insert into ctx select 'job2', id::text from public.rider_open_jobs();
select public.rider_claim_job((select v::uuid from ctx where k = 'job2'));
select pg_temp.expect_error('select public.rider_confirm_delivery((select v::uuid from ctx where k = ''job2''), ''1234'')', 'invalid_transition');
reset role;

select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
select public.partner_advance_order((select v::uuid from ctx where k = 'order'), 'out_for_delivery');
reset role;

select set_config('request.jwt.claim.sub', :rider, false);
set role authenticated;
select public.rider_confirm_delivery((select v::uuid from ctx where k = 'job2'), (select v from ctx where k = 'delivery_code'));
select pg_temp.check((select count(*) from public.orders) = 0, 'rider loses order access after delivery');
reset role;
select pg_temp.check((select status from public.orders) = 'delivered', 'delivered');

-- ---------------------------------------------------------------- payment, completion, review
select set_config('request.jwt.claim.sub', :partner, false);
set role authenticated;
select public.partner_mark_order_paid((select v::uuid from ctx where k = 'order'), 'cash', null);
select pg_temp.check((select amount from public.payments where kind = 'order') = 40, 'paid amount = approved final total');
select pg_temp.expect_error('select public.partner_mark_order_paid((select v::uuid from ctx where k = ''order''), ''cash'', null)', 'already_paid');
reset role;

select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
select public.confirm_order_received((select v::uuid from ctx where k = 'order'));
select pg_temp.check((select status from public.orders) = 'completed', 'completed');
select public.submit_review((select v::uuid from ctx where k = 'order'), 4, 'جيد');
select pg_temp.check((select rating_avg from public.laundries) = 4, 'rating aggregated');
select pg_temp.check((select count(*) from public.order_events where order_id = (select v::uuid from ctx where k = 'order')) >= 11, 'timeline recorded');
reset role;

-- ---------------------------------------------------------------- timeout + maintenance
select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
insert into ctx select 'order2', (public.place_order('22222222-2222-2222-2222-222222222222', (select v::uuid from ctx where k = 'laundry'),
  'dropoff', jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 2)),
  '{"name":"Customer","phone":"966500000004"}', '{}'))->>'id';
select pg_temp.check((select total from public.orders where id = (select v::uuid from ctx where k = 'order2')) = 10, 'drop-off has no delivery fees');
reset role;
update public.orders set accept_deadline = now() - interval '1 minute' where id = (select v::uuid from ctx where k = 'order2');
set role service_role;
select public.run_maintenance();
reset role;
select pg_temp.check((select status from public.orders where id = (select v::uuid from ctx where k = 'order2')) = 'cancelled', 'unaccepted order cancelled on timeout');

-- subscription expiry blocks new orders
update public.partner_subscriptions set current_period_end = now() - interval '10 days';
set role service_role;
select public.run_maintenance();
reset role;
select pg_temp.check((select status from public.partner_subscriptions) = 'expired', 'subscription expired after grace');
select set_config('request.jwt.claim.sub', :customer, false);
set role authenticated;
select pg_temp.check((select count(*) from public.nearby_laundries(26.22, 50.20)) = 0, 'expired partner hidden');
select pg_temp.expect_error($$select public.place_order('33333333-3333-3333-3333-333333333333', (select v::uuid from ctx where k = 'laundry'),
  'dropoff', jsonb_build_array(jsonb_build_object('service_id', (select v from ctx where k = 'svc_piece'), 'quantity', 2)),
  '{"name":"Customer","phone":"966500000004"}', '{}')$$, 'laundry_unavailable');
select pg_temp.check((select count(*) from public.orders) = 2, 'existing orders preserved after expiry');
select pg_temp.expect_error('select public.run_maintenance()', 'permission denied');
reset role;

select pg_temp.check((select count(*) from public.audit_logs where table_name = 'payments') >= 2, 'payments audited');
\echo 'order lifecycle: OK'
