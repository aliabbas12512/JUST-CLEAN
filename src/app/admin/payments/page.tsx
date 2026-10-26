import Link from "next/link";
import { confirmPaymentAction, rejectPaymentAction } from "@/app/actions/admin";
import { DateRangeForm } from "@/components/date-range-form";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Badge, Card, CardHeader, EmptyState, Input, PageHeader, Table, Td } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { parseRange } from "@/lib/date-range";
import { dateTime, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Payment } from "@/lib/types";

type Row = Payment & { laundries: { id: string; name: string } | null };

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const range = parseRange(await searchParams);
  const [{ data: pending }, { data: all }] = await Promise.all([
    supabase.from("payments").select("*, laundries(id, name)").eq("status", "pending").eq("kind", "partner_subscription").order("created_at"),
    supabase.from("payments").select("*, laundries(id, name)").gte("created_at", range.fromIso).lte("created_at", range.toIso).order("created_at", { ascending: false }).limit(300),
  ]);
  const pend = (pending as Row[]) ?? [];
  const list = (all as Row[]) ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title={t.admin.nav.payments} />
      <Card>
        <CardHeader title={t.admin.metrics.pendingPayments} />
        {pend.length === 0 ? <p className="p-4 text-sm text-[var(--muted)]">{t.common.none}</p> : (
          <ul className="divide-y divide-[var(--line)]">
            {pend.map((p) => (
              <li key={p.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/admin/laundries/${p.laundries?.id}`} className="font-bold text-brand-800">{p.laundries?.name}</Link>
                    <p className="text-sm text-[var(--muted)]">{t.paymentKind[p.kind]} · {t.paymentMethod[p.method]} · <span className="font-num">{dateTime(p.created_at, locale)}</span></p>
                    <p className="text-sm">{t.common.reference}: <b className="font-num" dir="ltr">{p.reference ?? "—"}</b></p>
                  </div>
                  <span className="font-num text-lg font-extrabold">{money(p.amount, locale)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={confirmPaymentAction}><input type="hidden" name="id" value={p.id} /><SubmitButton size="sm" variant="success" confirmText={t.common.areYouSure}>{t.admin.confirmPayment}</SubmitButton></ActionForm>
                  <ActionForm action={rejectPaymentAction} className="flex gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <Input name="notes" required placeholder={t.common.reason} className="h-9 w-48" />
                    <SubmitButton size="sm" variant="ghost">{t.admin.rejectPayment}</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <DateRangeForm from={range.from} to={range.to} t={t} exportHref={`/api/export/admin-payments?from=${range.from}&to=${range.to}`} />
      {list.length === 0 ? <EmptyState icon="wallet" title={t.common.none} /> : (
        <Table head={[t.common.date, t.common.type, t.order.laundry, t.order.payment, t.common.amount, t.common.status, t.partner.subscriptionPage.invoice]}>
          {list.map((p) => (
            <tr key={p.id}>
              <Td className="font-num">{dateTime(p.created_at, locale)}</Td>
              <Td>{t.paymentKind[p.kind]}</Td>
              <Td>{p.laundries?.name}</Td>
              <Td>{t.paymentMethod[p.method]}</Td>
              <Td className="font-num">{money(p.amount, locale)}</Td>
              <Td><Badge tone={p.status === "confirmed" ? "green" : p.status === "pending" ? "amber" : "red"}>{t.paymentRecordStatus[p.status]}</Badge></Td>
              <Td className="font-num">{p.invoice_number ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
