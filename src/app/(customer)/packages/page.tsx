import Link from "next/link";
import { SetupRequired } from "@/components/setup-required";
import { Card, EmptyState, LinkButton, PageHeader, Select } from "@/components/ui/primitives";
import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import type { City, Package } from "@/lib/types";

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase, user } = await getSession();
  if (!supabase) return <SetupRequired />;
  const cityId = Number((await searchParams).city) || null;
  const { data: cities } = await supabase.from("cities").select("*").eq("is_active", true).order("sort_order");
  let q = supabase.from("packages").select("*, laundries!inner(id, name, city_id, status, is_active)").eq("is_active", true).order("price").limit(60);
  if (cityId) q = q.eq("laundries.city_id", cityId);
  const { data } = await q;
  // Only show packages from laundries that can currently take orders.
  const raw = (data as (Package & { laundries: { id: string; name: string; city_id: number } })[]) ?? [];
  const ids = [...new Set(raw.map((p) => p.laundry_id))];
  const eligible = new Set<string>();
  await Promise.all(ids.map(async (id) => {
    const { data: ok } = await supabase.rpc("laundry_can_receive_orders", { p_laundry: id });
    if (ok) eligible.add(id);
  }));
  const list = raw.filter((p) => eligible.has(p.laundry_id));

  return (
    <div className="space-y-4">
      <PageHeader title={t.packages.title} subtitle={t.packages.subtitle}
        actions={user ? <LinkButton href="/account/packages" variant="secondary" size="sm">{t.packages.myPackages}</LinkButton> : undefined} />
      <form className="flex max-w-sm gap-2">
        <Select name="city" defaultValue={cityId ?? ""} aria-label={t.home.chooseCity}>
          <option value="">{t.common.all}</option>
          {((cities as City[]) ?? []).map((c) => <option key={c.id} value={c.id}>{locale === "ur" ? c.name_ur : c.name_ar}</option>)}
        </Select>
        <button className="rounded-xl bg-brand-900 px-4 font-semibold text-white">{t.common.filter}</button>
      </form>
      {list.length === 0 ? <EmptyState icon="box" title={t.packages.noPackages} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <Card key={p.id} className="flex flex-col p-4">
              <p className="text-sm text-[var(--muted)]">{p.laundries.name}</p>
              <p className="text-lg font-bold text-brand-950">{locale === "ur" && p.name_ur ? p.name_ur : p.name_ar}</p>
              <p className="font-num mt-1 text-2xl font-extrabold text-brand-900">{money(p.price, locale)}</p>
              <ul className="mt-2 flex-1 space-y-0.5 text-sm text-slate-600">
                <li>• {fmt(t.packages.pieces, { n: p.piece_credits })}</li>
                {p.max_orders && <li>• {fmt(t.packages.maxOrders, { n: p.max_orders })}</li>}
                <li>• {fmt(t.packages.validity, { n: p.interval_days })}</li>
                {p.free_pickup_delivery && <li>• {t.packages.freeDelivery}</li>}
              </ul>
              <Link href={`/laundry/${p.laundry_id}`} className="mt-3 text-center font-semibold text-brand-700">{t.common.details}</Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
