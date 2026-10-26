import Link from "next/link";
import { cancelOrderAction, confirmReceivedAction, respondAdjustmentAction, submitReviewAction } from "@/app/actions/customer";
import { LiveRefresh } from "@/components/live-refresh";
import { ItemsList, PriceBreakdown } from "@/components/orders/price-breakdown";
import { OrderTimeline } from "@/components/orders/timeline";
import { OrderStatusBadge } from "@/components/status-badge";
import { SetupRequired } from "@/components/setup-required";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Icon } from "@/components/ui/icon";
import { Alert, Card, CardHeader, EmptyState, KV, LinkButton, PageHeader, Textarea } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { dateTime, money, telUrl, timeOnly, windowLabel } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import { needsPickup, needsReturn } from "@/lib/orders";
import type { Order, OrderEvent, OrderItem } from "@/lib/types";

type RiderInfo = { job_id: string; leg: string; job_status: string; rider_name: string; rider_phone: string; vehicle_type: string };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { t, locale } = await getI18n();
  if (!isSupabaseConfigured) return <SetupRequired />;
  const { id } = await params;
  const { placed } = await searchParams;
  const { supabase, user } = await requireUser(`/orders/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return <EmptyState title={t.errors.not_found} />;

  const { data: o } = await supabase.from("orders").select("*, laundries(name, phone)").eq("id", id).maybeSingle();
  const order = o as (Order & { laundries: { name: string; phone: string } | null }) | null;
  if (!order || order.customer_id !== user.id) return <EmptyState title={t.errors.not_found} />;

  const [{ data: items }, { data: events }, { data: secrets }, { data: rider }, { data: review }, { data: refunds }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id),
    supabase.from("order_events").select("*").eq("order_id", id).order("created_at"),
    supabase.from("order_secrets").select("pickup_code, delivery_code").eq("order_id", id).maybeSingle(),
    supabase.rpc("order_rider_info", { p_order: id }),
    supabase.from("reviews").select("id, rating").eq("order_id", id).maybeSingle(),
    supabase.from("refunds").select("*").eq("order_id", id),
  ]);
  const riderInfo = ((rider as RiderInfo[]) ?? [])[0];
  const s = order.status;
  const closed = s === "completed" || s === "cancelled" || s === "rejected";
  const showPickupCode = needsPickup(order.fulfillment) && ["placed", "accepted", "pickup_assigned"].includes(s);
  const showDeliveryCode = !closed && s !== "delivered" && !showPickupCode;
  const deadlinePassed = order.accept_deadline && new Date(order.accept_deadline).getTime() < Date.now();

  return (
    <div className="space-y-4">
      <PageHeader
        back="/orders"
        title={<span className="font-num" dir="ltr">{order.order_number}</span>}
        subtitle={order.laundries?.name}
        actions={<OrderStatusBadge status={s} t={t} />}
      />
      {!closed && <LiveRefresh channel={`order-${id}`} subscriptions={[{ table: "orders", filter: `id=eq.${id}` }, { table: "order_events", filter: `order_id=eq.${id}` }]} />}
      {placed && s === "placed" && <Alert tone="green" title={t.order.placedSuccess} />}

      {s === "placed" && (
        <Alert tone="amber" title={t.order.awaitingAcceptance}>
          {deadlinePassed ? t.order.acceptTimedOut : order.accept_deadline && fmt(t.order.acceptBy, { time: timeOnly(order.accept_deadline, locale) })}
        </Alert>
      )}
      {s === "rejected" && <Alert tone="red" title={t.order.rejectedBy}>{order.rejection_reason}</Alert>}
      {s === "cancelled" && <Alert tone="red" title={t.order.cancelled}>{order.cancellation_reason && ((t.events as Record<string, string>)[order.cancellation_reason] ?? order.cancellation_reason)}</Alert>}

      {order.adjustment_status === "pending" && (
        <Card className="p-4 ring-2 ring-amber-300">
          <p className="font-bold text-brand-950">{t.order.adjustmentTitle}</p>
          <p className="mt-1 text-sm text-slate-600">{t.order.adjustmentBody} <b className="font-num text-lg text-brand-900">{money(order.final_total, locale)}</b></p>
          {order.adjustment_note && <p className="mt-1 text-sm text-slate-600">“{order.adjustment_note}”</p>}
          <ActionForm action={respondAdjustmentAction} className="mt-3 flex gap-2">
            <input type="hidden" name="order_id" value={id} />
            <SubmitButton name="decision" value="approve" variant="success">{t.order.approve}</SubmitButton>
            <SubmitButton name="decision" value="dispute" variant="secondary">{t.order.dispute}</SubmitButton>
          </ActionForm>
        </Card>
      )}
      {order.adjustment_status === "approved" && <Alert tone="green">{t.order.adjustmentApproved}</Alert>}
      {order.adjustment_status === "disputed" && <Alert tone="amber">{t.order.adjustmentDisputed}</Alert>}

      {secrets && (showPickupCode || showDeliveryCode) && (
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-2 font-bold text-brand-950"><Icon name="shield" className="size-5 text-brand-700" />{t.order.codesTitle}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {showPickupCode && <Code label={t.order.pickupCode} code={secrets.pickup_code} hint={t.order.pickupCodeHint} />}
            {showDeliveryCode && (
              <Code label={t.order.deliveryCode} code={secrets.delivery_code} hint={needsReturn(order.fulfillment) ? t.order.deliveryCodeHint : t.order.collectCodeHint} />
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(needsPickup(order.fulfillment) || needsReturn(order.fulfillment)) && !closed && (
            <Card className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-brand-50 p-2.5 text-brand-700"><Icon name="bike" /></span>
                <div>
                  <p className="text-sm text-[var(--muted)]">{t.order.rider}</p>
                  <p className="font-bold text-brand-950">{riderInfo ? `${riderInfo.rider_name} · ${(t.rider.vehicles as Record<string, string>)[riderInfo.vehicle_type]}` : t.order.riderPending}</p>
                </div>
              </div>
              {riderInfo && telUrl(riderInfo.rider_phone) && <LinkButton href={telUrl(riderInfo.rider_phone)!} variant="secondary" size="sm" icon="phone">{t.common.call}</LinkButton>}
            </Card>
          )}

          <Card>
            <CardHeader title={t.order.items} />
            <div className="px-4"><ItemsList items={(items as OrderItem[]) ?? []} t={t} locale={locale} /></div>
            <div className="border-t border-[var(--line)] p-4"><PriceBreakdown o={order} t={t} locale={locale} /></div>
          </Card>

          <Card>
            <CardHeader title={t.common.details} />
            <div className="px-4 py-2">
              <KV k={t.order.placedAt} v={<span className="font-num">{dateTime(order.created_at, locale)}</span>} />
              <KV k={t.order.fulfillment} v={t.checkout.methods[order.fulfillment].title} />
              {order.address_line && <KV k={needsPickup(order.fulfillment) ? t.order.pickupAddress : t.order.deliveryAddress} v={[order.district_text, order.address_line].filter(Boolean).join(" · ")} />}
              {order.window_start && <KV k={t.order.window} v={<span className="font-num">{windowLabel(order.window_start, order.window_end, locale)}</span>} />}
              <KV k={t.order.payment} v={`${t.paymentMethod[order.payment_method]} · ${t.paymentStatus[order.payment_status]}`} />
              {order.notes && <KV k={t.common.notes} v={order.notes} />}
            </div>
          </Card>

          {((refunds as { id: string; amount: number; status: string }[]) ?? []).map((r) => (
            <Alert key={r.id} tone={r.status === "processed" ? "green" : "blue"} title={r.status === "processed" ? t.order.refundProcessed : t.order.refundPending}>
              <span className="font-num">{money(r.amount, locale)}</span>
            </Alert>
          ))}

          {s === "delivered" && (
            <ActionForm action={confirmReceivedAction}>
              <input type="hidden" name="order_id" value={id} />
              <SubmitButton variant="success" size="lg" className="w-full" icon="check">{t.order.confirmReceived}</SubmitButton>
            </ActionForm>
          )}

          {(s === "delivered" || s === "completed") && (
            review ? <Alert tone="green">{t.order.thanksReview}</Alert> : (
              <Card className="p-4">
                <p className="font-bold text-brand-950">{t.order.rateTitle}</p>
                <ActionForm action={submitReviewAction} className="mt-3 space-y-3">
                  <input type="hidden" name="order_id" value={id} />
                  <fieldset className="flex flex-row-reverse justify-end gap-1" aria-label={t.order.rateTitle}>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <label key={n} className="cursor-pointer">
                        <input type="radio" name="rating" value={n} className="peer sr-only" required />
                        <span className="font-num flex size-10 items-center justify-center rounded-xl text-lg font-bold ring-1 ring-[var(--line)] peer-checked:bg-amber-400 peer-checked:text-white peer-checked:ring-amber-400">{n}★</span>
                      </label>
                    ))}
                  </fieldset>
                  <Textarea name="comment" maxLength={1000} placeholder={t.order.rateComment} />
                  <SubmitButton>{t.common.submit}</SubmitButton>
                </ActionForm>
              </Card>
            )
          )}

          {["placed", "accepted", "pickup_assigned"].includes(s) && (
            <details className="rounded-2xl bg-white p-4 ring-1 ring-[var(--line)]">
              <summary className="cursor-pointer font-semibold text-red-700">{t.order.cancelOrder}</summary>
              <p className="mt-2 text-sm text-[var(--muted)]">{t.order.cancelHint}</p>
              <ActionForm action={cancelOrderAction} className="mt-3 space-y-3">
                <input type="hidden" name="order_id" value={id} />
                <Textarea name="reason" maxLength={500} placeholder={t.order.cancelReason} />
                <SubmitButton variant="danger" confirmText={t.common.areYouSure}>{t.order.cancelOrder}</SubmitButton>
              </ActionForm>
            </details>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title={t.order.timeline} />
            <div className="p-4"><OrderTimeline fulfillment={order.fulfillment} status={s} events={(events as OrderEvent[]) ?? []} t={t} locale={locale} /></div>
          </Card>
          <Card className="space-y-2 p-4 text-sm">
            {order.laundries?.phone && telUrl(order.laundries.phone) && (
              <a href={telUrl(order.laundries.phone)!} className="flex items-center gap-2 font-semibold text-brand-700"><Icon name="phone" className="size-4.5" />{t.order.callLaundry}</a>
            )}
            <Link href={`/support?order=${encodeURIComponent(order.order_number)}`} className="flex items-center gap-2 font-semibold text-brand-700"><Icon name="support" className="size-4.5" />{t.order.contactSupport}</Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Code({ label, code, hint }: { label: string; code: string; hint: string }) {
  return (
    <div className="rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100">
      <p className="text-sm text-brand-800">{label}</p>
      <p className="font-num my-1 text-3xl font-extrabold tracking-[0.3em] text-brand-950" dir="ltr">{code}</p>
      <p className="text-xs text-[var(--muted)]">{hint}</p>
    </div>
  );
}
