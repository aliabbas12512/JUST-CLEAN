import { adminCancelOrderAction, assignJobAction, createRefundAction, openJobAction, processRefundAction } from "@/app/actions/admin";
import { ItemsList, PriceBreakdown } from "@/components/orders/price-breakdown";
import { EventLog } from "@/components/orders/timeline";
import { OrderStatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Badge, Card, CardHeader, EmptyState, Input, KV, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { dateTime, money, windowLabel } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { needsPickup, needsReturn } from "@/lib/orders";
import { displayPhone } from "@/lib/phone";
import type { DeliveryJob, Order, OrderEvent, OrderItem, Payment, Rider } from "@/lib/types";

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = await getI18n();
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: o } = await supabase.from("orders").select("*, laundries(name, phone)").eq("id", id).maybeSingle();
  const order = o as (Order & { laundries: { name: string; phone: string } | null }) | null;
  if (!order) return <EmptyState title={t.errors.not_found} />;
  const [{ data: items }, { data: events }, { data: jobs }, { data: payments }, { data: refunds }, { data: riders }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id),
    supabase.from("order_events").select("*").eq("order_id", id).order("created_at"),
    supabase.from("delivery_jobs").select("*, riders(full_name, phone)").eq("order_id", id).order("created_at"),
    supabase.from("payments").select("*").eq("order_id", id),
    supabase.from("refunds").select("*").eq("order_id", id).order("created_at"),
    supabase.from("riders").select("id, full_name, is_online").eq("status", "active").eq("city_id", order.city_id ?? -1).order("is_online", { ascending: false }),
  ]);
  const jobList = (jobs as (DeliveryJob & { riders: { full_name: string; phone: string } | null })[]) ?? [];
  const riderList = (riders as Pick<Rider, "id" | "full_name" | "is_online">[]) ?? [];
  const s = order.status;
  const canOpenJob = (s === "accepted" && needsPickup(order.fulfillment) || s === "ready" && needsReturn(order.fulfillment))
    && !jobList.some((j) => ["open", "assigned", "picked_up"].includes(j.status));
  const confirmed = ((payments as Payment[]) ?? []).find((p) => p.status === "confirmed");
  const a = t.admin;

  return (
    <div className="space-y-4">
      <PageHeader back="/admin/orders" title={<span className="font-num" dir="ltr">{order.order_number}</span>} subtitle={order.laundries?.name} actions={<OrderStatusBadge status={s} t={t} />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={t.common.details} />
            <div className="grid gap-x-6 px-4 py-2 sm:grid-cols-2">
              <KV k={t.partner.customer} v={order.contact_name} />
              <KV k={t.common.phone} v={<span className="font-num" dir="ltr">{displayPhone(order.contact_phone)}</span>} />
              <KV k={t.order.fulfillment} v={t.checkout.methods[order.fulfillment].title} />
              <KV k={t.order.payment} v={`${t.paymentMethod[order.payment_method]} · ${t.paymentStatus[order.payment_status]}`} />
              {order.address_line && <KV k={t.common.address} v={[order.district_text, order.address_line].filter(Boolean).join(" · ")} />}
              {order.window_start && <KV k={t.order.window} v={<span className="font-num">{windowLabel(order.window_start, order.window_end, locale)}</span>} />}
              {order.adjustment_status && <KV k={t.order.finalTotal} v={<span>{money(order.final_total, locale)} · {order.adjustment_status}</span>} />}
              {Number(order.commission_amount) > 0 && <KV k={a.reports.commissions} v={<span className="font-num">{money(order.commission_amount, locale)}</span>} />}
              {order.cancellation_reason && <KV k={t.common.reason} v={order.cancellation_reason} />}
            </div>
          </Card>
          <Card>
            <CardHeader title={t.order.items} />
            <div className="px-4"><ItemsList items={(items as OrderItem[]) ?? []} t={t} locale={locale} /></div>
            <div className="border-t border-[var(--line)] p-4"><PriceBreakdown o={order} t={t} locale={locale} /></div>
          </Card>
          <Card>
            <CardHeader title={a.jobs} />
            <ul className="divide-y divide-[var(--line)] px-4">
              {jobList.length === 0 && <li className="py-3 text-sm text-[var(--muted)]">—</li>}
              {jobList.map((j) => (
                <li key={j.id} className="space-y-2 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{t.rider.legs[j.leg]} · <Badge tone={j.status === "failed" ? "red" : j.status === "delivered" ? "green" : "blue"}>{t.rider.jobStatus[j.status]}</Badge></span>
                    <span className="text-[var(--muted)]">{j.riders ? `${j.riders.full_name} · ${displayPhone(j.riders.phone)}` : "—"}</span>
                  </div>
                  {j.fail_reason && <p className="text-red-700">{j.fail_reason}</p>}
                  {(j.status === "open" || j.status === "assigned") && (
                    <ActionForm action={assignJobAction} className="flex gap-2">
                      <input type="hidden" name="job_id" value={j.id} />
                      <Select name="rider_id" required className="flex-1">
                        <option value="">{a.selectRider}</option>
                        {riderList.map((r) => <option key={r.id} value={r.id}>{r.full_name}{r.is_online ? " ●" : ""}</option>)}
                      </Select>
                      <SubmitButton size="sm">{a.assignRider}</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {canOpenJob && (
              <div className="border-t border-[var(--line)] p-4">
                <ActionForm action={openJobAction}><input type="hidden" name="order_id" value={id} /><SubmitButton variant="secondary" size="sm" icon="plus">{a.openJob}</SubmitButton></ActionForm>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title={a.refunds} />
            <div className="space-y-3 p-4">
              {((refunds as { id: string; amount: number; reason: string; status: string; created_at: string }[]) ?? []).map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                  <span><b className="font-num">{money(r.amount, locale)}</b> · {(t.events as Record<string, string>)[r.reason] ?? r.reason} · {r.status}</span>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <ActionForm action={processRefundAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="processed" /><SubmitButton size="sm" variant="success" confirmText={t.common.areYouSure}>{a.processRefund}</SubmitButton></ActionForm>
                      <ActionForm action={processRefundAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="rejected" /><SubmitButton size="sm" variant="ghost">{a.rejectRefund}</SubmitButton></ActionForm>
                    </div>
                  )}
                </div>
              ))}
              {confirmed && (
                <ActionForm action={createRefundAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="order_id" value={id} />
                  <Input name="amount" type="number" step="0.01" min={0.01} max={confirmed.amount} required placeholder={t.common.amount} className="w-32" dir="ltr" />
                  <Input name="reason" required placeholder={t.common.reason} className="min-w-0 flex-1" />
                  <SubmitButton size="sm" variant="secondary">{a.createRefund}</SubmitButton>
                </ActionForm>
              )}
            </div>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader title={t.order.timeline} />
            <div className="p-4"><EventLog events={(events as OrderEvent[]) ?? []} t={t} locale={locale} /></div>
          </Card>
          {!["completed", "cancelled", "rejected"].includes(s) && (
            <Card className="p-4">
              <ActionForm action={adminCancelOrderAction} className="space-y-2">
                <input type="hidden" name="order_id" value={id} />
                <Textarea name="reason" required placeholder={t.common.reason} maxLength={500} />
                <SubmitButton variant="danger" className="w-full" confirmText={t.common.areYouSure}>{a.cancelOrder}</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <p className="font-num text-xs text-[var(--muted)]">{dateTime(order.created_at, locale)}</p>
        </aside>
      </div>
    </div>
  );
}
