import { DateRangeForm } from "@/components/date-range-form";
import { Alert, PageHeader, Stat } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { parseRange } from "@/lib/date-range";
import { money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

type R = { subscription_revenue: number; commissions: number; gmv: number; package_sales: number; refunds: number; rider_payouts: number; orders: number; orders_completed: number };

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const range = parseRange(await searchParams);
  const { data } = await supabase.rpc("admin_revenue_report", { p_from: range.fromIso, p_to: range.toIso });
  const r = (data as R) ?? ({} as R);
  const k = t.admin.reports;
  // Platform revenue = what the platform itself earns. Rider payouts are a platform cost only if the platform pays riders.
  const platform = Number(r.subscription_revenue ?? 0) + Number(r.commissions ?? 0) - Number(r.rider_payouts ?? 0);
  return (
    <div className="space-y-4">
      <PageHeader title={k.title} />
      <DateRangeForm from={range.from} to={range.to} t={t} exportHref={`/api/export/admin-payments?from=${range.from}&to=${range.to}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={k.subscriptionRevenue} value={money(r.subscription_revenue, locale)} icon="refresh" />
        <Stat label={k.commissions} value={money(r.commissions, locale)} icon="tag" />
        <Stat label={k.riderPayouts} value={money(r.rider_payouts, locale)} icon="bike" />
        <Stat label={k.platformRevenue} value={money(platform, locale)} icon="wallet" />
        <Stat label={k.refunds} value={money(r.refunds, locale)} icon="x" />
        <Stat label={k.ordersCount} value={`${r.orders_completed ?? 0} / ${r.orders ?? 0}`} icon="list" />
      </div>
      <Alert tone="blue" title={k.gmv}>
        <span className="font-num text-lg font-bold">{money(Number(r.gmv ?? 0) + Number(r.package_sales ?? 0), locale)}</span>
      </Alert>
    </div>
  );
}
