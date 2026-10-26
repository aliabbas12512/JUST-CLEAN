import { adjustPriceAction, advanceOrderAction, markPaidAction, requestRiderAction, respondOrderAction } from "@/app/actions/partner";
import { LiveRefresh } from "@/components/live-refresh";
import { ItemsList, PriceBreakdown } from "@/components/orders/price-breakdown";
import { EventLog, OrderTimeline } from "@/components/orders/timeline";
import { OrderStatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Icon } from "@/components/ui/icon";
import { Alert, Card, CardHeader, EmptyState, Field, Input, KV, LinkButton, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { requireLaundry } from "@/lib/auth";
import { dateTime, mapsUrl, money, telUrl, timeOnly, windowLabel } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import { amountDue, needsPickup, needsReturn } from "@/lib/orders";
import { displayPhone } from "@/lib/phone";
import type { DeliveryJob, Order, OrderEvent, OrderItem } from "@/lib/types";

type RiderInfo = { job_id: string; leg: string; job_status: string; rider_name: string; rider_phone: string; vehicle_type: string };

function Step({ id, to, label, variant = "primary" }: { id: string; to: string; label: string; variant?: "primary" | "success" }) {
  return (
    <ActionForm action={advanceOrderAction}>
      <input type="hidden" name="order_id" value={id} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton variant={variant} size="lg" className="w-full">{label}</SubmitButton>
    </ActionForm>
  );
}

export default async function PartnerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = await getI18n();
  const { id } = await params;
  const { supabase, laundry } = await requireLaundry();
  const { data: o } = await supabase.from("orders").select("*").eq("id", id).eq("laundry_id", laundry.id).maybeSingle();
  const order = o as Order | null;
  if (!order) return <EmptyState title={t.errors.not_found} />;

  const [{ data: items }, { data: events }, { data: jobs }, { data: riders }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id),
    supabase.from("order_events").select("*").eq("order_id", id).order("created_at"),
    supabase.from("delivery_jobs").select("*").eq("order_id", id).order("created_at"),
    supabase.rpc("order_rider_info", { p_order: id }),
  ]);
  const jobList = (jobs as DeliveryJob[]) ?? [];
  const rider = ((riders as RiderInfo[]) ?? [])[0];
  const s = order.status;
  const hasLiveJob = (leg: "pickup" | "return") => jobList.some((j) => j.leg === leg && ["open", "assigned", "picked_up"].includes(j.status));
  const canAdjust = (s === "received" || s === "processing") && order.payment_status !== "paid";
  const canMarkPaid = !["placed", "rejected", "cancelled"].includes(s) && order.payment_status !== "paid" && order.adjustment_status !== "pending";
  const p = t.partner;


  return (
    <div className="space-y-4">
      <PageHeader back="/partner/orders" title={<span className="font-num" dir="ltr">{order.order_number}</span>}
        subtitle={t.checkout.methods[order.fulfillment].title}
        actions={<><OrderStatusBadge status={s} t={t} /><LiveRefresh channel={`p-order-${id}`} subscriptions={[{ table: "orders", filter: `id=eq.${id}` }, { table: "delivery_jobs", filter: `order_id=eq.${id}` }]} showBadge={false} /></>} />

      {/* Next step panel */}
      <Card className="p-4 ring-2 ring-brand-200">
        <p className="mb-3 text-sm font-bold text-brand-700">{p.nextStep}</p>
        {s === "placed" && (
          <div className="space-y-3">
            {order.accept_deadline && <p className="text-sm text-amber-700">{fmt(t.order.acceptBy, { time: timeOnly(order.accept_deadline, locale) })}</p>}
            <ActionForm action={respondOrderAction}>
              <input type="hidden" name="order_id" value={id} />
              <input type="hidden" name="decision" value="accept" />
              <SubmitButton variant="success" size="lg" className="w-full" icon="check">{p.accept}</SubmitButton>
            </ActionForm>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-red-700">{p.reject}</summary>
              <ActionForm action={respondOrderAction} className="mt-2 space-y-2">
                <input type="hidden" name="order_id" value={id} />
                <input type="hidden" name="decision" value="reject" />
                <Textarea name="reason" required maxLength={500} placeholder={p.rejectReason} />
                <SubmitButton variant="danger">{p.reject}</SubmitButton>
              </ActionForm>
            </details>
          </div>
        )}
        {s === "accepted" && needsPickup(order.fulfillment) && (
          hasLiveJob("pickup") ? <Alert tone="blue">{p.waitingRider}</Alert> : (
            <ActionForm action={requestRiderAction}><input type="hidden" name="order_id" value={id} /><SubmitButton icon="bike">{p.requestRider}</SubmitButton></ActionForm>
          )
        )}
        {s === "accepted" && !needsPickup(order.fulfillment) && (
          <div className="space-y-2"><p className="text-sm text-[var(--muted)]">{p.waitingCustomerDropoff}</p><Step id={id} to="received" label={p.markReceived} /></div>
        )}
        {s === "pickup_assigned" && <Alert tone="blue">{p.waitingRiderPickup}</Alert>}
        {s === "picked_up" && <Step id={id} to="received" label={p.markReceived} />}
        {s === "received" && <Step id={id} to="processing" label={p.startProcessing} />}
        {s === "processing" && (order.adjustment_status === "pending" ? <Alert tone="amber">{p.adjustPending}</Alert> : <Step id={id} to="ready" label={p.markReady} variant="success" />)}
        {s === "ready" && needsReturn(order.fulfillment) && (
          hasLiveJob("return") ? <Alert tone="blue">{p.waitingRider}</Alert> : (
            <ActionForm action={requestRiderAction}><input type="hidden" name="order_id" value={id} /><SubmitButton icon="bike">{p.requestRider}</SubmitButton></ActionForm>
          )
        )}
        {s === "ready" && !needsReturn(order.fulfillment) && (
          <ActionForm action={advanceOrderAction} className="space-y-2">
            <input type="hidden" name="order_id" value={id} />
            <input type="hidden" name="to" value="completed" />
            <Field label={p.customerCode}><Input name="code" required inputMode="numeric" maxLength={4} dir="ltr" className="text-center text-2xl tracking-[0.4em]" /></Field>
            <SubmitButton variant="success" size="lg" className="w-full">{p.completeWithCode}</SubmitButton>
          </ActionForm>
        )}
        {s === "return_assigned" && <Step id={id} to="out_for_delivery" label={p.handToRider} />}
        {["out_for_delivery", "delivered", "completed", "cancelled", "rejected"].includes(s) && <p className="font-semibold text-brand-950">{t.status[s]}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={p.customer} />
            <div className="px-4 py-2">
              <KV k={t.common.name} v={order.contact_name} />
              <KV k={t.common.phone} v={<a href={telUrl(order.contact_phone) ?? "#"} className="font-num text-brand-700" dir="ltr">{displayPhone(order.contact_phone)}</a>} />
              {order.address_line && <KV k={t.common.address} v={<span>{[order.district_text, order.address_line].filter(Boolean).join(" · ")}{order.address_notes && <span className="block text-xs text-[var(--muted)]">{order.address_notes}</span>}</span>} />}
              {mapsUrl(order.address_lat, order.address_lng) && <KV k="" v={<a href={mapsUrl(order.address_lat, order.address_lng)!} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand-700"><Icon name="nav" className="size-4" />{t.common.navigate}</a>} />}
              {order.window_start && <KV k={t.order.window} v={<span className="font-num">{windowLabel(order.window_start, order.window_end, locale)}</span>} />}
              {order.notes && <KV k={t.common.notes} v={<span className="text-amber-800">{order.notes}</span>} />}
              {rider && <KV k={t.order.rider} v={<a href={telUrl(rider.rider_phone) ?? "#"} className="text-brand-700">{rider.rider_name} · <span className="font-num" dir="ltr">{displayPhone(rider.rider_phone)}</span></a>} />}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.order.items} />
            <div className="px-4"><ItemsList items={(items as OrderItem[]) ?? []} t={t} locale={locale} /></div>
            <div className="border-t border-[var(--line)] p-4"><PriceBreakdown o={order} t={t} locale={locale} /></div>
          </Card>

          {canAdjust && (
            <Card className="p-4">
              <p className="font-bold text-brand-950">{p.adjustPrice}</p>
              {order.is_estimate && <p className="text-sm text-[var(--muted)]">{t.checkout.estimateNote}</p>}
              <ActionForm action={adjustPriceAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="order_id" value={id} />
                <Field label={t.order.finalTotal}><Input name="amount" type="number" min={0} step="0.5" required defaultValue={order.final_total ?? order.total} dir="ltr" /></Field>
                <Field label={p.adjustNote}><Input name="note" required maxLength={500} /></Field>
                <div className="sm:col-span-2"><SubmitButton variant="secondary">{t.common.submit}</SubmitButton></div>
              </ActionForm>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-brand-950">{t.order.payment}</p>
              <span className="text-sm">{t.paymentMethod[order.payment_method]} · <b>{t.paymentStatus[order.payment_status]}</b></span>
            </div>
            {canMarkPaid && (
              <ActionForm action={markPaidAction} className="mt-3 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="order_id" value={id} />
                <Field label={t.common.amount}><Input value={money(amountDue(order), locale)} readOnly className="font-num" /></Field>
                <Field label={t.order.payment}>
                  <Select name="method"><option value="cash">{t.paymentMethod.cash}</option><option value="bank_transfer">{t.paymentMethod.bank_transfer}</option></Select>
                </Field>
                <Field label={p.paymentReference}><Input name="reference" maxLength={120} dir="ltr" /></Field>
                <div className="sm:col-span-3"><SubmitButton variant="success" confirmText={t.common.areYouSure}>{p.markPaid}</SubmitButton></div>
              </ActionForm>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title={t.order.timeline} />
            <div className="p-4"><OrderTimeline fulfillment={order.fulfillment} status={s} events={(events as OrderEvent[]) ?? []} t={t} locale={locale} /></div>
          </Card>
          <Card>
            <CardHeader title={t.admin.jobs} />
            <ul className="divide-y divide-[var(--line)] px-4 text-sm">
              {jobList.length === 0 && <li className="py-3 text-[var(--muted)]">—</li>}
              {jobList.map((j) => (
                <li key={j.id} className="py-2.5">
                  <p className="font-semibold">{t.rider.legs[j.leg]} · {t.rider.jobStatus[j.status]}</p>
                  {j.fail_reason && <p className="text-red-700">{j.fail_reason}</p>}
                  <p className="font-num text-xs text-[var(--muted)]">{dateTime(j.created_at, locale)}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={t.common.details} />
            <div className="p-4"><EventLog events={(events as OrderEvent[]) ?? []} t={t} locale={locale} /></div>
          </Card>
          <LinkButton href={`/support?order=${encodeURIComponent(order.order_number)}`} variant="ghost" icon="support">{t.order.contactSupport}</LinkButton>
        </aside>
      </div>
    </div>
  );
}
