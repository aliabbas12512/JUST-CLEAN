import { PageHeader, Table, Td } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

type Log = { id: number; actor_id: string | null; table_name: string; record_id: string | null; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string };

function diff(o: Record<string, unknown> | null, n: Record<string, unknown> | null): string {
  if (!o) return Object.keys(n ?? {}).slice(0, 6).join(", ");
  if (!n) return "—";
  return Object.keys(n).filter((k) => k !== "updated_at" && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => `${k}: ${JSON.stringify(o[k])} → ${JSON.stringify(n[k])}`).join("; ").slice(0, 300);
}

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const table = (await searchParams).table;
  let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300);
  if (table) q = q.eq("table_name", table);
  const { data } = await q;
  const logs = (data as Log[]) ?? [];
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name, phone").in("id", actorIds) : { data: [] };
  const actorName = (id: string | null) => { if (!id) return "system"; const a = (actors ?? []).find((x: { id: string }) => x.id === id) as { full_name: string | null; phone: string | null } | undefined; return a?.full_name ?? a?.phone ?? id.slice(0, 8); };
  const a = t.admin.audit;
  return (
    <div>
      <PageHeader title={t.admin.nav.audit} />
      <form className="mb-3 flex gap-2">
        <select name="table" defaultValue={table ?? ""} className="h-10 rounded-xl bg-white px-2 ring-1 ring-[var(--line)]" dir="ltr">
          <option value="">{t.common.all}</option>
          {["laundries", "riders", "partner_subscriptions", "payments", "refunds", "platform_settings", "promo_codes", "cities", "districts", "profiles"].map((x) => <option key={x}>{x}</option>)}
        </select>
        <button className="h-10 rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white">{t.common.filter}</button>
      </form>
      <Table head={[t.common.date, a.actor, a.table, a.action, a.changes]}>
        {logs.map((l) => (
          <tr key={l.id}>
            <Td className="font-num whitespace-nowrap">{dateTime(l.created_at, locale)}</Td>
            <Td>{actorName(l.actor_id)}</Td>
            <Td><span dir="ltr">{l.table_name}</span></Td>
            <Td>{l.action}</Td>
            <Td><code dir="ltr" className="block max-w-md break-all text-xs text-slate-600">{diff(l.old_data, l.new_data)}</code></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
