-- Least privilege for RPCs: functions that need a signed-in user are not callable by anon,
-- and trigger functions are not callable through the API at all. The functions already
-- validate the caller; this removes them from the anonymous surface entirely.
-- Still public on purpose: nearby_laundries, quote_order, laundry_can_receive_orders and the
-- RLS helpers (is_admin, owns_laundry, can_view_order, settings).
do $$
declare f text;
begin
  foreach f in array array[
    'admin_assign_job(uuid,uuid)', 'admin_cancel_order(uuid,text)', 'admin_confirm_payment(uuid,text)',
    'admin_create_refund(uuid,numeric,text)', 'admin_metrics()', 'admin_open_job(uuid)',
    'admin_process_refund(uuid,public.refund_status)', 'admin_record_subscription_payment(uuid,public.payment_method,text)',
    'admin_reject_payment(uuid,text)', 'admin_revenue_report(timestamptz,timestamptz)',
    'admin_review_laundry(uuid,public.laundry_status,text)', 'admin_review_rider(uuid,public.rider_status,text)',
    'admin_set_laundry_active(uuid,boolean)', 'admin_set_subscription_status(uuid,public.subscription_status,text)',
    'cancel_customer_package(uuid)', 'cancel_order(uuid,text)', 'confirm_order_received(uuid)', 'order_rider_info(uuid)',
    'partner_adjust_price(uuid,numeric,text)', 'partner_advance_order(uuid,public.order_status,text)',
    'partner_confirm_package_payment(uuid,text)', 'partner_mark_order_paid(uuid,public.payment_method,text)',
    'partner_reply_review(uuid,text)', 'partner_report(uuid,timestamptz,timestamptz)', 'partner_request_rider(uuid)',
    'partner_respond_order(uuid,boolean,text)', 'partner_start_online_subscription_payment(uuid)',
    'partner_submit_subscription_payment(uuid,public.payment_method,text)',
    'place_order(uuid,uuid,public.fulfillment_method,jsonb,jsonb,jsonb,timestamptz,timestamptz,text,text,uuid,public.payment_method)',
    'purchase_package(uuid,public.payment_method)', 'respond_price_adjustment(uuid,boolean)', 'rider_claim_job(uuid)',
    'rider_confirm_delivery(uuid,text)', 'rider_confirm_pickup(uuid,text)', 'rider_fail_job(uuid,text)', 'rider_open_jobs()',
    'rider_release_job(uuid)', 'rider_set_online(boolean,double precision,double precision)', 'submit_laundry(uuid)',
    'submit_review(uuid,integer,text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;

  foreach f in array array['audit_profile_admin()', 'audit_row()', 'handle_new_user()', 'handle_user_contact_change()',
                           'refresh_laundry_rating()']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
