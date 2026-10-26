import { DateRangeForm } from "@/components/date-range-form";
import { PageHeader, Stat, Table, Td } from "@/components/ui/primitives";
import { requireLaundry } from "@/lib/auth";
import { parseRange } from "@/lib/date-range";
import { money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

type Report = { orders: number; completed: number; cancelled: number; gross: number; collected: number; by_day: { day: string; orders: number; gross: number }[] };

export default async function PartnerReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase, laundry } = await requireLaundry();
  const range = parseRange(await searchParams);
  const { data } = await supabase.rpc("partner_report", { p_laundry: laundry.id, p_from: range.fromIso, p_to: range.toIso });
  const r = (data as Report) ?? { orders: 0, completed: 0, cancelled: 0, gross: 0, collected: 0, by_day: [] };
  const rp = t.partner.reports;
  return (
    <div className="space-y-4">
      <PageHeader title={rp.title} />
      <DateRangeForm from={range.from} to={range.to} t={t} exportHref={`/api/export/partner-orders?from=${range.from}&to=${range.to}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={rp.orders} value={r.orders} />
        <Stat label={rp.completed} value={r.completed} />
        <Stat label={rp.cancelled} value={r.cancelled} />
        <Stat label={rp.gross} value={money(r.gross, locale)} />
        <Stat label={rp.collected} value={money(r.collected, locale)} />
      </div>
      <h2 className="font-bold text-brand-950">{rp.byDay}</h2>
      <Table head={[t.common.date, rp.orders, rp.gross]}>
        {r.by_day.map((d) => (
          <tr key={d.day}><Td className="font-num">{d.day}</Td><Td className="font-num">{d.orders}</Td><Td className="font-num">{money(d.gross, locale)}</Td></tr>
        ))}
      </Table>
    </div>
  );
}
