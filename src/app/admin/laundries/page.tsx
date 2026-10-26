import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Tabs, Td } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { laundryStatusTone } from "@/lib/tones";
import type { Laundry, LaundryStatus, SubscriptionStatus } from "@/lib/types";

export default async function AdminLaundries({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const tab = sp.status ?? "submitted";
  let q = supabase.from("laundries").select("*, partner_subscriptions(status, current_period_end)").order("created_at", { ascending: false }).limit(200);
  if (tab === "submitted") q = q.in("status", ["submitted", "under_review"]);
  else if (tab === "suspended") q = q.eq("is_active", false);
  else if (tab !== "all") q = q.eq("status", tab);
  if (sp.q) q = q.ilike("name", `%${sp.q}%`);
  const { data } = await q;
  const list = (data as (Laundry & { partner_subscriptions: { status: string } | null })[]) ?? [];
  const tabs = ["submitted", "approved", "info_required", "rejected", "draft", "suspended", "all"];
  const label = (k: string) => k === "all" ? t.common.all : k === "suspended" ? t.admin.metrics.suspended : t.laundryStatus[k as LaundryStatus];
  return (
    <div>
      <PageHeader title={t.admin.nav.laundries} />
      <form className="mb-3"><input name="q" defaultValue={sp.q} placeholder={t.common.search} className="h-10 w-full max-w-sm rounded-xl bg-white px-3 ring-1 ring-[var(--line)]" /><input type="hidden" name="status" value={tab} /></form>
      <Tabs active={tab} items={tabs.map((k) => ({ key: k, label: label(k), href: `/admin/laundries?status=${k}` }))} />
      {list.length === 0 ? <EmptyState icon="store" title={t.common.none} /> : (
        <Table head={[t.partner.fields.businessName, t.common.city, t.common.status, t.admin.subscription, t.common.date]}>
          {list.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50">
              <Td><Link href={`/admin/laundries/${l.id}`} className="font-semibold text-brand-800">{l.name}</Link><span className="block text-xs text-[var(--muted)]">{l.representative_name}</span></Td>
              <Td>{l.district_text ?? l.address}</Td>
              <Td><Badge tone={laundryStatusTone[l.status]}>{label(l.status)}</Badge>{!l.is_active && <Badge tone="red" className="ms-1">{t.admin.metrics.suspended}</Badge>}</Td>
              <Td>{l.partner_subscriptions ? t.subscriptionStatus[l.partner_subscriptions.status as SubscriptionStatus] : "—"}</Td>
              <Td className="font-num">{dateTime(l.created_at, locale)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
