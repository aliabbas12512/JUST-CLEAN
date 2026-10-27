import { LiveRefresh } from "@/components/live-refresh";
import { PartnerOrderRow } from "@/components/partner/order-row";
import { Alert, Card, CardHeader, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui/primitives";
import { getActiveLaundry, requireUser } from "@/lib/auth";
import { riyadhNow, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import type { Order, PartnerSubscription } from "@/lib/types";

export default async function PartnerDashboard() {
  const { t, locale } = await getI18n();
  const { supabase } = await requireUser("/partner");
  const laundry = await getActiveLaundry();

  if (!laundry) {
    const { data: settings } = await supabase.from("platform_settings").select("partner_subscription_price").maybeSingle();
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon="store" title={t.partner.registerTitle}
          body={<>{t.partner.registerSubtitle}<br />{fmt(t.partner.pricingNote, { price: money(settings?.partner_subscription_price ?? 100, locale) })}</>}
          action={<LinkButton href="/partner/register" icon="plus">{t.partner.registerTitle}</LinkButton>} />
      </div>
    );
  }

  const { ymd } = riyadhNow();
  const todayStart = `${ymd}T00:00:00+03:00`;
  const monthStart = `${ymd.slice(0, 7)}-01T00:00:00+03:00`;
  const [{ data: sub }, { data: canReceive }, pendingQ, activeQ, todayQ, { data: monthPayments }] = await Promise.all([
    supabase.from("partner_subscriptions").select("*").eq("laundry_id", laundry.id).maybeSingle(),
    supabase.rpc("laundry_can_receive_orders", { p_laundry: laundry.id }),
    supabase.from("orders").select("*").eq("laundry_id", laundry.id).eq("status", "placed").order("created_at"),
    supabase.from("orders").select("*", { count: "exact" }).eq("laundry_id", laundry.id)
      .in("status", ["accepted", "pickup_assigned", "picked_up", "received", "processing", "ready", "return_assigned", "out_for_delivery"])
      .order("updated_at", { ascending: false }).limit(8),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("laundry_id", laundry.id).gte("created_at", todayStart),
    supabase.from("payments").select("amount").eq("laundry_id", laundry.id).in("kind", ["order", "customer_package"]).eq("status", "confirmed").gte("confirmed_at", monthStart),
  ]);
  const subscription = sub as PartnerSubscription | null;
  const pending = (pendingQ.data as Order[]) ?? [];
  const active = (activeQ.data as Order[]) ?? [];
  const monthSales = ((monthPayments as { amount: number }[]) ?? []).reduce((a, p) => a + Number(p.amount), 0);

  const reasons: string[] = [];
  if (!canReceive) {
    if (laundry.status !== "approved") reasons.push(t.partner.notReceivingReasons.not_approved);
    if (!laundry.is_active) reasons.push(t.partner.notReceivingReasons.inactive);
    if (!laundry.accepting_orders) reasons.push(t.partner.notReceivingReasons.paused);
    if (laundry.status === "approved" && (!subscription || !["active", "past_due"].includes(subscription.status))) reasons.push(t.partner.notReceivingReasons.subscription);
  }
  const bannerTone = laundry.status === "approved" ? "green" : laundry.status === "rejected" ? "red" : "amber";

  return (
    <div className="space-y-4">
      <PageHeader title={laundry.name} subtitle={t.partner.title} actions={<LiveRefresh channel={`partner-${laundry.id}`} subscriptions={[{ table: "orders", filter: `laundry_id=eq.${laundry.id}` }]} />} />

      {laundry.status !== "approved" && (
        <Alert tone={bannerTone} title={t.partner.statusBanner[laundry.status]}>
          {laundry.review_notes && <p><b>{t.partner.reviewNotes}:</b> {laundry.review_notes}</p>}
          {["draft", "info_required", "rejected"].includes(laundry.status) && <LinkButton href="/partner/settings" size="sm" className="mt-2">{t.common.edit}</LinkButton>}
        </Alert>
      )}
      {reasons.length > 0 && laundry.status === "approved" && (
        <Alert tone="amber" title={t.partner.notReceivingOrders}>
          <ul className="list-inside list-disc">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {reasons.includes(t.partner.notReceivingReasons.subscription) && <LinkButton href="/partner/subscription" size="sm" className="mt-2">{t.partner.nav.subscription}</LinkButton>}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.partner.stats.pending} value={pending.length} icon="bell" href="/partner/orders?tab=new" />
        <Stat label={t.partner.stats.inProgress} value={activeQ.count ?? 0} icon="refresh" href="/partner/orders?tab=active" />
        <Stat label={t.partner.stats.today} value={todayQ.count ?? 0} icon="list" />
        <Stat label={t.partner.stats.monthSales} value={money(monthSales, locale)} icon="wallet" href="/partner/reports" />
      </div>

      <Card>
        <CardHeader title={t.partner.stats.pending} />
        <div className="space-y-2 p-3">
          {pending.length === 0 ? <p className="p-2 text-sm text-[var(--muted)]">{t.order.noOrders}</p> : pending.map((o) => <PartnerOrderRow key={o.id} o={o} t={t} locale={locale} />)}
        </div>
      </Card>
      <Card>
        <CardHeader title={t.partner.stats.inProgress} action={<LinkButton href="/partner/orders?tab=active" variant="ghost" size="sm">{t.common.more}</LinkButton>} />
        <div className="space-y-2 p-3">
          {active.length === 0 ? <p className="p-2 text-sm text-[var(--muted)]">{t.order.noOrders}</p> : active.map((o) => <PartnerOrderRow key={o.id} o={o} t={t} locale={locale} />)}
        </div>
      </Card>
    </div>
  );
}
