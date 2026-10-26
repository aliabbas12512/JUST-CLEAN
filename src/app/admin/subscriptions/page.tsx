import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Tabs, Td } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { dateOnly, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { subscriptionTone } from "@/lib/tones";
import type { PartnerSubscription, SubscriptionStatus } from "@/lib/types";

export default async function AdminSubscriptions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const tab = (await searchParams).status ?? "all";
  let q = supabase.from("partner_subscriptions").select("*, laundries(id, name)").order("current_period_end", { ascending: true, nullsFirst: true }).limit(500);
  if (tab !== "all") q = q.eq("status", tab);
  const { data } = await q;
  const list = (data as (PartnerSubscription & { laundries: { id: string; name: string } | null })[]) ?? [];
  const statuses: SubscriptionStatus[] = ["active", "pending", "past_due", "expired", "suspended", "cancelled"];
  return (
    <div>
      <PageHeader title={t.admin.nav.subscriptions} />
      <Tabs active={tab} items={[{ key: "all", label: t.common.all, href: "/admin/subscriptions" }, ...statuses.map((s) => ({ key: s, label: t.subscriptionStatus[s], href: `/admin/subscriptions?status=${s}` }))]} />
      {list.length === 0 ? <EmptyState icon="refresh" title={t.common.none} /> : (
        <Table head={[t.order.laundry, t.common.status, t.common.amount, t.partner.subscriptionPage.periodEnd]}>
          {list.map((s) => (
            <tr key={s.id}>
              <Td><Link href={`/admin/laundries/${s.laundries?.id}`} className="font-semibold text-brand-800">{s.laundries?.name}</Link></Td>
              <Td><Badge tone={subscriptionTone[s.status]}>{t.subscriptionStatus[s.status]}</Badge></Td>
              <Td className="font-num">{money(s.price, locale)}</Td>
              <Td className="font-num">{dateOnly(s.current_period_end, locale)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
