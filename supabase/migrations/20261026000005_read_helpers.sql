-- Just Clean — read helpers for UI.

-- Rider contact for an order's live job, for the customer/partner/admin of that order only.
create or replace function public.order_rider_info(p_order uuid)
returns table (job_id uuid, leg public.job_leg, job_status public.job_status, rider_name text, rider_phone text, vehicle_type text)
language sql stable security definer set search_path = public as $$
  select j.id, j.leg, j.status, r.full_name, r.phone, r.vehicle_type
  from public.delivery_jobs j join public.riders r on r.id = j.rider_id
  where j.order_id = p_order and j.status in ('assigned','picked_up')
    and public.can_view_order(p_order)
  order by j.created_at desc
$$;

-- Admin dashboard counters in one round trip.
create or replace function public.admin_metrics()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._assert_admin();
  select jsonb_build_object(
    'customers', (select count(*) from public.profiles),
    'laundries_total', (select count(*) from public.laundries),
    'laundries_approved', (select count(*) from public.laundries where status = 'approved' and is_active),
    'laundries_pending', (select count(*) from public.laundries where status in ('submitted','under_review')),
    'laundries_suspended', (select count(*) from public.laundries where not is_active),
    'riders_active', (select count(*) from public.riders where status = 'active'),
    'riders_online', (select count(*) from public.riders where status = 'active' and is_online),
    'riders_pending', (select count(*) from public.riders where status = 'pending'),
    'orders_today', (select count(*) from public.orders where created_at >= date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'),
    'cancelled_30d', (select count(*) from public.orders where status in ('cancelled','rejected') and created_at > now() - interval '30 days'),
    'failed_jobs_30d', (select count(*) from public.delivery_jobs where status = 'failed' and created_at > now() - interval '30 days'),
    'subs_active', (select count(*) from public.partner_subscriptions where status = 'active'),
    'mrr', (select coalesce(sum(price), 0) from public.partner_subscriptions where status = 'active'),
    'payments_pending', (select count(*) from public.payments where status = 'pending' and kind = 'partner_subscription'),
    'refunds_pending', (select count(*) from public.refunds where status = 'pending'),
    'tickets_open', (select count(*) from public.support_tickets where status in ('open','in_progress')),
    'orders_by_status', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
                         from (select status, count(*) c from public.orders where created_at > now() - interval '30 days' group by status) x)
  ) into v;
  return v;
end $$;

-- Revenue report for a date range (admin). Keeps gross order value separate from platform revenue.
create or replace function public.admin_revenue_report(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_admin();
  return jsonb_build_object(
    'subscription_revenue', (select coalesce(sum(amount), 0) from public.payments
                             where kind = 'partner_subscription' and status = 'confirmed' and confirmed_at between p_from and p_to),
    'commissions', (select coalesce(sum(commission_amount), 0) from public.orders
                    where status = 'completed' and completed_at between p_from and p_to),
    'gmv', (select coalesce(sum(amount), 0) from public.payments
            where kind = 'order' and status in ('confirmed','refunded') and confirmed_at between p_from and p_to),
    'package_sales', (select coalesce(sum(amount), 0) from public.payments
                      where kind = 'customer_package' and status = 'confirmed' and confirmed_at between p_from and p_to),
    'refunds', (select coalesce(sum(amount), 0) from public.refunds where status = 'processed' and processed_at between p_from and p_to),
    'rider_payouts', (select coalesce(sum(rider_fee), 0) from public.delivery_jobs where status = 'delivered' and delivered_at between p_from and p_to),
    'orders', (select count(*) from public.orders where created_at between p_from and p_to),
    'orders_completed', (select count(*) from public.orders where status = 'completed' and created_at between p_from and p_to)
  );
end $$;

-- Partner report for one laundry and date range.
create or replace function public.partner_report(p_laundry uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_owner(p_laundry);
  return jsonb_build_object(
    'orders', (select count(*) from public.orders where laundry_id = p_laundry and created_at between p_from and p_to),
    'completed', (select count(*) from public.orders where laundry_id = p_laundry and status = 'completed' and created_at between p_from and p_to),
    'cancelled', (select count(*) from public.orders where laundry_id = p_laundry and status in ('cancelled','rejected') and created_at between p_from and p_to),
    'gross', (select coalesce(sum(coalesce(case when adjustment_status = 'approved' then final_total end, total)), 0)
              from public.orders where laundry_id = p_laundry and status not in ('cancelled','rejected') and created_at between p_from and p_to),
    'collected', (select coalesce(sum(amount), 0) from public.payments
                  where laundry_id = p_laundry and kind in ('order','customer_package') and status = 'confirmed' and confirmed_at between p_from and p_to),
    'by_day', (select coalesce(jsonb_agg(d order by d->>'day'), '[]'::jsonb) from (
                 select jsonb_build_object('day', to_char(created_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD'),
                                           'orders', count(*),
                                           'gross', coalesce(sum(total) filter (where status not in ('cancelled','rejected')), 0)) d
                 from public.orders where laundry_id = p_laundry and created_at between p_from and p_to
                 group by to_char(created_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD')) x)
  );
end $$;

-- Staff can notify users (e.g. support replies).
create policy notifications_admin_insert on public.notifications for insert with check (public.is_admin());
