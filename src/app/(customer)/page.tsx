import Link from "next/link";
import { Suspense } from "react";
import { LaundryCard } from "@/components/customer/laundry-card";
import { LocationBar } from "@/components/customer/location-bar";
import { SetupRequired } from "@/components/setup-required";
import { Icon } from "@/components/ui/icon";
import { EmptyState, LinkButton } from "@/components/ui/primitives";
import { getSession } from "@/lib/auth";
import { isOpenNow } from "@/lib/hours";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import type { Category, City, NearbyLaundry } from "@/lib/types";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function HomePage({ searchParams }: { searchParams: SP }) {
  const { t, locale } = await getI18n();
  const { supabase, user } = await getSession();
  if (!supabase) return <SetupRequired />;

  const sp = await searchParams;
  const lat = Number(one(sp.lat));
  const lng = Number(one(sp.lng));
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && one(sp.lat) !== undefined;
  const cityId = Number(one(sp.city)) || null;
  const categoryId = Number(one(sp.cat)) || null;
  const q = (one(sp.q) ?? "").trim().slice(0, 60);
  const sort = one(sp.sort) ?? "recommended";
  const filters = new Set((one(sp.f) ?? "").split(",").filter(Boolean));

  const [{ data: cities }, { data: categories }] = await Promise.all([
    supabase.from("cities").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
  ]);
  const cityList = (cities as City[]) ?? [];
  const cats = (categories as Category[]) ?? [];
  const city = cityList.find((c) => c.id === cityId);
  const hasLocation = hasCoords || !!city;

  let laundries: NearbyLaundry[] = [];
  let favorites = new Set<string>();
  if (hasLocation) {
    const { data } = await supabase.rpc("nearby_laundries", {
      p_lat: hasCoords ? lat : null,
      p_lng: hasCoords ? lng : null,
      p_city_id: hasCoords ? null : cityId,
      p_category_id: categoryId,
      p_search: q || null,
    });
    laundries = (data as NearbyLaundry[]) ?? [];
    if (filters.has("pickup")) laundries = laundries.filter((l) => l.supports_pickup);
    if (filters.has("delivery")) laundries = laundries.filter((l) => l.supports_delivery);
    if (filters.has("rating4")) laundries = laundries.filter((l) => Number(l.rating_avg) >= 4);
    if (filters.has("open")) laundries = laundries.filter((l) => isOpenNow(l.opening_hours) !== false);
    if (sort === "distance") laundries.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
    else if (sort === "rating") laundries.sort((a, b) => Number(b.rating_avg) - Number(a.rating_avg) || b.rating_count - a.rating_count);
    else if (sort === "price") laundries.sort((a, b) => Number(a.starting_price ?? 1e9) - Number(b.starting_price ?? 1e9));
    else {
      // Recommended: open first, then a blend of proximity and rating.
      const score = (l: NearbyLaundry) =>
        (isOpenNow(l.opening_hours) === false ? 100 : 0) + (l.distance_km ?? 5) - Number(l.rating_avg) * 0.6;
      laundries.sort((a, b) => score(a) - score(b));
    }
    if (user) {
      const { data: favs } = await supabase.from("favorites").select("laundry_id");
      favorites = new Set((favs ?? []).map((f: { laundry_id: string }) => f.laundry_id));
    }
  }

  const base = new URLSearchParams();
  if (hasCoords) { base.set("lat", String(lat)); base.set("lng", String(lng)); } else if (city) base.set("city", String(city.id));
  const link = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(base);
    if (categoryId) p.set("cat", String(categoryId));
    if (q) p.set("q", q);
    if (sort !== "recommended") p.set("sort", sort);
    if (filters.size) p.set("f", [...filters].join(","));
    for (const [k, v] of Object.entries(patch)) (v === null ? p.delete(k) : p.set(k, v));
    return `/?${p.toString()}`;
  };
  const toggleFilter = (f: string) => {
    const next = new Set(filters);
    if (next.has(f)) next.delete(f); else next.add(f);
    return link({ f: next.size ? [...next].join(",") : null });
  };
  const catName = (c: Category) => (locale === "ur" ? c.name_ur : c.name_ar);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-bl from-brand-900 to-brand-700 px-5 py-6 text-white sm:px-8 sm:py-8">
        <h1 className="text-2xl font-extrabold leading-snug sm:text-3xl">{t.home.heroTitle}</h1>
        <p className="mt-2 max-w-xl text-brand-100">{t.home.heroSubtitle}</p>
        <div className="mt-5 max-w-2xl">
          <Suspense fallback={<div className="skeleton h-11 rounded-xl" />}>
            <LocationBar cities={cityList} compact />
          </Suspense>
        </div>
      </section>

      {!hasLocation ? (
        <>
          <EmptyState icon="pin" title={t.home.pickLocationTitle} body={t.home.pickLocationBody} />
          <HowItWorks t={t} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-brand-950">{hasCoords ? t.home.nearYou : fmt(t.home.inCity, { city: city ? (locale === "ur" ? city.name_ur : city.name_ar) : "" })}</h2>
              {hasCoords && <p className="text-sm text-[var(--muted)]">{t.home.usingLocation}</p>}
            </div>
            <form action="/" className="flex w-full gap-2 sm:w-auto">
              {[...base.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              {categoryId && <input type="hidden" name="cat" value={categoryId} />}
              <div className="relative flex-1 sm:w-72">
                <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
                <input name="q" defaultValue={q} placeholder={t.home.searchPlaceholder}
                  className="h-11 w-full rounded-xl bg-white ps-10 pe-3 ring-1 ring-inset ring-[var(--line)] focus:ring-2 focus:ring-brand-500" />
              </div>
              <button className="h-11 rounded-xl bg-brand-900 px-4 font-semibold text-white">{t.common.search}</button>
            </form>
          </div>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <Link href={link({ cat: null })} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${!categoryId ? "bg-brand-900 text-white ring-brand-900" : "bg-white text-slate-600 ring-[var(--line)]"}`}>{t.common.all}</Link>
            {cats.map((c) => (
              <Link key={c.id} href={link({ cat: String(c.id) })}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${categoryId === c.id ? "bg-brand-900 text-white ring-brand-900" : "bg-white text-slate-600 ring-[var(--line)]"}`}>
                {catName(c)}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Icon name="filter" className="size-4.5 text-slate-400" />
            {(["pickup", "delivery", "rating4", "open"] as const).map((f) => (
              <Link key={f} href={toggleFilter(f)}
                className={`rounded-lg px-3 py-1.5 font-medium ring-1 ${filters.has(f) ? "bg-brand-50 text-brand-800 ring-brand-200" : "bg-white text-slate-600 ring-[var(--line)]"}`}>
                {f === "open" ? t.home.filters.openNow : t.home.filters[f]}
              </Link>
            ))}
            <span className="ms-auto text-[var(--muted)]">{t.common.sort}:</span>
            {(["recommended", "distance", "rating", "price"] as const).filter((s) => s !== "distance" || hasCoords).map((s) => (
              <Link key={s} href={link({ sort: s === "recommended" ? null : s })}
                className={`rounded-lg px-2.5 py-1.5 font-medium ${sort === s ? "text-brand-800 underline underline-offset-4" : "text-slate-500"}`}>
                {t.home.sort[s]}
              </Link>
            ))}
          </div>

          {laundries.length === 0 ? (
            <EmptyState icon="store" title={t.home.noResultsTitle} body={t.home.noResultsBody} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {laundries.map((l) => (
                <LaundryCard key={l.id} l={l} t={t} locale={locale} isFavorite={favorites.has(l.id)} canFavorite={!!user} />
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-[var(--line)] sm:flex-row sm:items-center">
        <p className="font-semibold text-brand-950">{t.home.partnerCta}</p>
        <LinkButton href="/partner" variant="secondary" icon="store">{t.nav.forBusiness}</LinkButton>
      </div>
    </div>
  );
}

function HowItWorks({ t }: { t: Awaited<ReturnType<typeof getI18n>>["t"] }) {
  const steps = [
    { icon: "pin" as const, text: t.home.step1 },
    { icon: "shirt" as const, text: t.home.step2 },
    { icon: "truck" as const, text: t.home.step3 },
    { icon: "clock" as const, text: t.home.step4 },
  ];
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-brand-950">{t.home.howItWorks}</h2>
      <ol className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {steps.map((s, i) => (
          <li key={i} className="rounded-2xl bg-white p-4 ring-1 ring-[var(--line)]">
            <div className="mb-2 flex items-center gap-2 text-brand-700">
              <span className="font-num flex size-7 items-center justify-center rounded-full bg-brand-50 text-sm font-bold">{i + 1}</span>
              <Icon name={s.icon} />
            </div>
            <p className="text-sm font-semibold text-brand-950">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
