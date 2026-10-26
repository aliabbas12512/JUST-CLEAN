import Link from "next/link";
import { OrderStatusBadge } from "@/components/status-badge";
import { DateRangeForm } from "@/components/date-range-form";
import { EmptyState, PageHeader, Table, Td } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { parseRange } from "@/lib/date-range";
import { dateTime, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Order, OrderStatus } from "@/lib/types";

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; refunds?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const range = parseRange(sp);
  const qn = (sp.q ?? "").trim().toUpperCase();
  let q = supabase.from("orders").select("*, laundries(name)").order("created_at", { ascending: false }).limit(200);
  if (qn) q = q.ilike("order_number", `%${qn}%`);
  else {
    q = q.gte("created_at", range.fromIso).lte("created_at", range.toIso);
    if (sp.status && sp.status in t.status) q = q.eq("status", sp.status);
  }
  if (sp.refunds) {
    const { data: r } = await supabase.from("refunds").select("order_id").eq("status", "pending");
    const ids = ((r as { order_id: string }[]) ?? []).map((x) => x.order_id);
    q = supabase.from("orders").select("*, laundries(name)").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data } = await q;
  const orders = (data as (Order & { laundries: { name: string } | null })[]) ?? [];
  return (
    <div>
      <PageHeader title={t.admin.nav.orders} />
      <form className="mb-3 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder={t.admin.searchOrder} dir="ltr" className="h-10 min-w-0 flex-1 rounded-xl bg-white px-3 ring-1 ring-[var(--line)]" />
        <select name="status" defaultValue={sp.status ?? ""} className="h-10 rounded-xl bg-white px-2 ring-1 ring-[var(--line)]">
          <option value="">{t.common.all}</option>
          {(Object.keys(t.status) as OrderStatus[]).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
        </select>
        <button className="h-10 rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white">{t.common.search}</button>
      </form>
      <DateRangeForm from={range.from} to={range.to} t={t} exportHref={`/api/export/admin-orders?from=${range.from}&to=${range.to}`} />
      {orders.length === 0 ? <EmptyState icon="list" title={t.order.noOrders} /> : (
        <Table head={[t.order.number, t.order.laundry, t.common.status, t.order.fulfillment, t.common.total, t.order.payment, t.common.date]}>
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td><Link href={`/admin/orders/${o.id}`} className="font-num font-semibold text-brand-800" dir="ltr">{o.order_number}</Link></Td>
              <Td>{o.laundries?.name}</Td>
              <Td><OrderStatusBadge status={o.status} t={t} /></Td>
              <Td>{t.checkout.methods[o.fulfillment].title}</Td>
              <Td className="font-num">{money(o.final_total ?? o.total, locale)}</Td>
              <Td>{t.paymentStatus[o.payment_status]}</Td>
              <Td className="font-num">{dateTime(o.created_at, locale)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
