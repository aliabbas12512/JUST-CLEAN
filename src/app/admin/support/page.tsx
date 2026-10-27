import Link from "next/link";
import { Badge, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const tab = (await searchParams).status ?? "open";
  let q = supabase.from("support_tickets").select("*, orders(order_number), profiles(full_name, phone)").order("updated_at", { ascending: false }).limit(200);
  q = tab === "open" ? q.in("status", ["open", "in_progress"]) : tab === "disputes" ? q.eq("is_dispute", true) : q.in("status", ["resolved", "closed"]);
  const { data } = await q;
  const list = (data ?? []) as { id: string; subject: string; status: keyof typeof t.support.statuses; is_dispute: boolean; updated_at: string;
    orders: { order_number: string } | null; profiles: { full_name: string | null; phone: string | null } | null }[];
  return (
    <div>
      <PageHeader title={t.admin.nav.support} />
      <Tabs active={tab} items={[
        { key: "open", label: t.support.statuses.open, href: "/admin/support" },
        { key: "disputes", label: t.support.isDispute, href: "/admin/support?status=disputes" },
        { key: "closed", label: t.support.statuses.resolved, href: "/admin/support?status=closed" },
      ]} />
      {list.length === 0 ? <EmptyState icon="support" title={t.support.noTickets} /> : (
        <ul className="space-y-2">
          {list.map((tk) => (
            <li key={tk.id}>
              <Link href={`/admin/support/${tk.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-[var(--line)] hover:bg-slate-50">
                <div>
                  <p className="font-semibold text-brand-950">{tk.subject}</p>
                  <p className="text-xs text-[var(--muted)]">{tk.profiles?.full_name ?? tk.profiles?.phone} {tk.orders && <span className="font-num" dir="ltr">· {tk.orders.order_number}</span>} · <span className="font-num">{dateTime(tk.updated_at, locale)}</span></p>
                </div>
                <div className="flex gap-1">{tk.is_dispute && <Badge tone="red">!</Badge>}<Badge tone="amber">{t.support.statuses[tk.status]}</Badge></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
