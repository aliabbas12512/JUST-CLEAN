import { PageHeader, Stat, Card, CardHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { OrderStatus } from "@/lib/types";

type Metrics = Record<string, number> & { orders_by_status: Partial<Record<OrderStatus, number>> };

export default async function AdminOverview() {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_metrics");
  const m = (data as Metrics) ?? ({ orders_by_status: {} } as Metrics);
  const k = t.admin.metrics;
  const statuses = Object.entries(m.orders_by_status ?? {}) as [OrderStatus, number][];
  const max = Math.max(1, ...statuses.map(([, v]) => v));
  return (
    <div className="space-y-5">
      <PageHeader title={t.admin.nav.overview} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={k.customers} value={m.customers ?? 0} icon="user" />
        <Stat label={k.ordersToday} value={m.orders_today ?? 0} icon="list" href="/admin/orders" />
        <Stat label={k.activeSubs} value={m.subs_active ?? 0} icon="refresh" href="/admin/subscriptions" />
        <Stat label={k.mrr} value={money(m.mrr ?? 0, locale)} icon="wallet" href="/admin/reports" />
        <Stat label={`${k.laundries} · ${k.approved}`} value={`${m.laundries_approved ?? 0} / ${m.laundries_total ?? 0}`} icon="store" href="/admin/laundries" />
        <Stat label={k.pending} value={m.laundries_pending ?? 0} icon="alert" href="/admin/laundries?status=submitted" />
        <Stat label={k.suspended} value={m.laundries_suspended ?? 0} icon="x" href="/admin/laundries?status=suspended" />
        <Stat label={`${k.riders} · ${k.ridersOnline}`} value={`${m.riders_active ?? 0} · ${m.riders_online ?? 0}`} icon="bike" href="/admin/riders" />
        <Stat label={k.pendingPayments} value={m.payments_pending ?? 0} icon="wallet" href="/admin/payments" />
        <Stat label={k.pendingRefunds} value={m.refunds_pending ?? 0} icon="refresh" href="/admin/orders?refunds=1" />
        <Stat label={k.cancelled} value={m.cancelled_30d ?? 0} icon="x" />
        <Stat label={k.failedDeliveries} value={m.failed_jobs_30d ?? 0} icon="alert" />
      </div>
      <Card>
        <CardHeader title={k.ordersByStatus} subtitle="30d" />
        <div className="space-y-2 p-4">
          {statuses.length === 0 && <p className="text-sm text-[var(--muted)]">—</p>}
          {statuses.map(([s, v]) => (
            <div key={s} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0">{t.status[s]}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(v / max) * 100}%` }} /></div>
              <span className="font-num w-10 text-end font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
