import { LiveRefresh } from "@/components/live-refresh";
import { PartnerOrderRow } from "@/components/partner/order-row";
import { EmptyState, LinkButton, PageHeader, Tabs } from "@/components/ui/primitives";
import { requireLaundry } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import type { Order, OrderStatus } from "@/lib/types";

const TABS: Record<string, OrderStatus[]> = {
  new: ["placed"],
  active: ["accepted", "pickup_assigned", "picked_up", "received", "processing", "ready", "return_assigned", "out_for_delivery", "delivered"],
  done: ["completed"],
  cancelled: ["cancelled", "rejected"],
};

export default async function PartnerOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase, laundry } = await requireLaundry();
  const sp = await searchParams;
  const tab = sp.tab && sp.tab in TABS ? sp.tab : "new";
  const q = (sp.q ?? "").trim().toUpperCase();
  let query = supabase.from("orders").select("*").eq("laundry_id", laundry.id).order("created_at", { ascending: tab === "new" }).limit(100);
  query = q ? query.ilike("order_number", `%${q}%`) : query.in("status", TABS[tab]);
  const { data } = await query;
  const orders = (data as Order[]) ?? [];
  return (
    <div>
      <PageHeader title={t.partner.nav.orders} actions={
        <>
          <LiveRefresh channel={`partner-orders-${laundry.id}`} subscriptions={[{ table: "orders", filter: `laundry_id=eq.${laundry.id}` }]} />
          <LinkButton href={`/api/export/partner-orders`} variant="secondary" size="sm" prefetch={false}>{t.common.export}</LinkButton>
        </>
      } />
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder={t.admin.searchOrder} dir="ltr" className="h-10 flex-1 rounded-xl bg-white px-3 ring-1 ring-[var(--line)]" />
        <button className="rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white">{t.common.search}</button>
      </form>
      {!q && <Tabs active={tab} items={Object.keys(TABS).map((k) => ({ key: k, label: t.partner.orderTabs[k as keyof typeof t.partner.orderTabs], href: `/partner/orders?tab=${k}` }))} />}
      {orders.length === 0 ? <EmptyState icon="list" title={t.order.noOrders} /> : (
        <div className="space-y-2">{orders.map((o) => <PartnerOrderRow key={o.id} o={o} t={t} locale={locale} />)}</div>
      )}
    </div>
  );
}
