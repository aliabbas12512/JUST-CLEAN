import { submitSubscriptionPaymentAction } from "@/app/actions/partner";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Alert, Badge, Card, CardHeader, Field, Input, KV, PageHeader, Table, Td } from "@/components/ui/primitives";
import { requireLaundry } from "@/lib/auth";
import { isOnlinePaymentConfigured } from "@/lib/env";
import { dateOnly, dateTime, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import type { PartnerSubscription, Payment, SubscriptionStatus } from "@/lib/types";

const subTone: Record<SubscriptionStatus, "green" | "amber" | "red" | "gray"> = {
  active: "green", pending: "amber", past_due: "amber", expired: "red", suspended: "red", cancelled: "gray",
};

export default async function PartnerSubscriptionPage({ searchParams }: { searchParams: Promise<{ payment?: string; error?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase, laundry } = await requireLaundry();
  const sp = await searchParams;
  const [{ data: sub }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from("partner_subscriptions").select("*").eq("laundry_id", laundry.id).maybeSingle(),
    supabase.from("payments").select("*").eq("laundry_id", laundry.id).eq("kind", "partner_subscription").order("created_at", { ascending: false }),
    supabase.from("platform_settings").select("partner_subscription_price, grace_days, bank_transfer_instructions").maybeSingle(),
  ]);
  const s = sub as PartnerSubscription | null;
  const list = (payments as Payment[]) ?? [];
  const pendingPay = list.find((p) => p.status === "pending" && p.method !== "online");
  const sp2 = t.partner.subscriptionPage;
  const statusLabel: Record<SubscriptionStatus, string> = {
    pending: t.paymentRecordStatus.pending, active: t.common.active, past_due: t.paymentStatus.unpaid,
    expired: t.packages.statusLabels.expired, suspended: t.rider.statusLabels.suspended, cancelled: t.packages.statusLabels.cancelled,
  };
  const graceEnd = s?.current_period_end ? new Date(new Date(s.current_period_end).getTime() + (settings?.grace_days ?? 0) * 86400000) : null;
  const graceDaysLeft = graceEnd ? Math.max(0, Math.ceil((graceEnd.getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={sp2.title} subtitle={fmt(sp2.price, { price: money(settings?.partner_subscription_price ?? 100, locale) })} />
      {sp.payment === "paid" && <Alert tone="green">{t.notifications.kinds.subscription_active}</Alert>}
      {sp.payment === "unpaid" && <Alert tone="amber">{sp2.pendingNote}</Alert>}
      {sp.error && <Alert tone="red">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Alert>}

      {!s ? <Alert tone="blue">{sp2.notReady}</Alert> : (
        <>
          <Card>
            <CardHeader title={sp2.status} action={<Badge tone={subTone[s.status]}>{statusLabel[s.status]}</Badge>} />
            <div className="px-4 py-2">
              <KV k={t.common.amount} v={<span className="font-num">{money(s.price, locale)}</span>} />
              {s.current_period_end && <KV k={sp2.periodEnd} v={<span className="font-num">{dateOnly(s.current_period_end, locale)}</span>} />}
              {s.current_period_end && s.status === "active" && <KV k={sp2.renewal} v={<span className="font-num">{dateOnly(s.current_period_end, locale)}</span>} />}
            </div>
          </Card>
          {s.status === "past_due" && <Alert tone="amber">{fmt(sp2.graceWarning, { days: graceDaysLeft })}</Alert>}
          {["pending", "expired", "suspended", "cancelled"].includes(s.status) && <Alert tone="red">{sp2.expiredWarning}</Alert>}

          {s.status !== "suspended" && (
            <Card>
              <CardHeader title={sp2.payByTransfer} />
              <div className="space-y-3 p-4">
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-bold text-brand-950">{sp2.bankDetails}</p>
                  <p className="mt-1 whitespace-pre-line text-slate-600">{settings?.bank_transfer_instructions || sp2.noBankDetails}</p>
                </div>
                {pendingPay ? <Alert tone="amber">{sp2.pendingNote}</Alert> : (
                  <ActionForm action={submitSubscriptionPaymentAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Field label={sp2.transferRef} className="flex-1"><Input name="reference" required maxLength={120} dir="ltr" /></Field>
                    <SubmitButton>{sp2.submitPayment}</SubmitButton>
                  </ActionForm>
                )}
                <div className="border-t border-[var(--line)] pt-3">
                  {isOnlinePaymentConfigured ? (
                    <form action="/api/payments/subscription" method="post">
                      <button className="inline-flex h-11 items-center rounded-xl bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700">{sp2.payOnline}</button>
                    </form>
                  ) : <p className="text-sm text-[var(--muted)]">{sp2.onlineUnavailable}</p>}
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      <h2 className="pt-2 font-bold text-brand-950">{sp2.history}</h2>
      <Table head={[t.common.date, t.common.amount, t.order.payment, sp2.period, sp2.invoice, t.common.status]}>
        {list.map((p) => (
          <tr key={p.id}>
            <Td className="font-num">{dateTime(p.created_at, locale)}</Td>
            <Td className="font-num">{money(p.amount, locale)}</Td>
            <Td>{t.paymentMethod[p.method]}{p.reference && <span className="font-num block text-xs text-[var(--muted)]" dir="ltr">{p.reference}</span>}</Td>
            <Td className="font-num">{p.period_start ? `${dateOnly(p.period_start, locale)} – ${dateOnly(p.period_end, locale)}` : "—"}</Td>
            <Td className="font-num" >{p.invoice_number ?? "—"}</Td>
            <Td><Badge tone={p.status === "confirmed" ? "green" : p.status === "pending" ? "amber" : "red"}>{t.paymentRecordStatus[p.status]}</Badge></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
