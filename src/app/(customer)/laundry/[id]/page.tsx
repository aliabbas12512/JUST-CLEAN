import Image from "next/image";
import type { Metadata } from "next";
import { CartBar, MenuItem } from "@/components/customer/menu-item";
import { FavoriteButton } from "@/components/customer/favorite-button";
import { SetupRequired } from "@/components/setup-required";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Icon } from "@/components/ui/icon";
import { Alert, Badge, Card, CardHeader, EmptyState, KV, Stars } from "@/components/ui/primitives";
import { purchasePackageAction } from "@/app/actions/customer";
import { getSession } from "@/lib/auth";
import { dateOnly, mapsUrl, money, telUrl } from "@/lib/format";
import { isOpenNow } from "@/lib/hours";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import { publicLogoUrl } from "@/lib/storage";
import type { Category, Laundry, Package, Review, Service } from "@/lib/types";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { supabase } = await getSession();
  if (!supabase) return {};
  const { id } = await params;
  const { data } = await supabase.from("laundries").select("name").eq("id", id).maybeSingle();
  return { title: data?.name };
}

export default async function LaundryPage({ params }: { params: Params }) {
  const { id } = await params;
  const { t, locale } = await getI18n();
  const { supabase, user } = await getSession();
  if (!supabase) return <SetupRequired />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return <EmptyState icon="store" title={t.laundry.notFound} />;

  const [{ data: l }, { data: services }, { data: categories }, { data: packages }, { data: reviews }, { data: canOrder }] = await Promise.all([
    supabase.from("laundries").select("*").eq("id", id).maybeSingle(),
    supabase.from("services").select("*").eq("laundry_id", id).eq("is_active", true).order("sort_order").order("created_at"),
    supabase.from("service_categories").select("*").order("sort_order"),
    supabase.from("packages").select("*").eq("laundry_id", id).eq("is_active", true).order("price"),
    supabase.from("reviews").select("*").eq("laundry_id", id).eq("is_hidden", false).order("created_at", { ascending: false }).limit(10),
    supabase.rpc("laundry_can_receive_orders", { p_laundry: id }),
  ]);
  const laundry = l as Laundry | null;
  if (!laundry || laundry.status !== "approved") return <EmptyState icon="store" title={t.laundry.notFound} />;

  let isFav = false;
  if (user) {
    const { data: f } = await supabase.from("favorites").select("laundry_id").eq("laundry_id", id).maybeSingle();
    isFav = !!f;
  }

  const svc = (services as Service[]) ?? [];
  const cats = ((categories as Category[]) ?? []).filter((c) => svc.some((s) => s.category_id === c.id));
  const logo = publicLogoUrl(laundry.logo_path);
  const open = isOpenNow(laundry.opening_hours);
  const available = canOrder === true;
  const days = t.days;

  return (
    <div className="space-y-5 pb-20">
      <Card className="p-4 sm:p-5">
        <div className="flex gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-brand-50">
            {logo ? <Image src={logo} alt="" fill sizes="80px" className="object-cover" /> :
              <div className="flex size-full items-center justify-center text-brand-700"><Icon name="shirt" className="size-10" /></div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-xl font-extrabold text-brand-950">{laundry.name}</h1>
              {user && <FavoriteButton laundryId={laundry.id} initial={isFav} />}
            </div>
            <p className="mt-0.5 text-sm text-[var(--muted)]">{[laundry.district_text, laundry.address].filter(Boolean).join(" · ")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {laundry.rating_count > 0 ? <Stars value={laundry.rating_avg} count={laundry.rating_count} /> : <span className="text-sm text-[var(--muted)]">{t.laundry.noReviews}</span>}
              {!available ? <Badge tone="red">{t.laundry.unavailable}</Badge> : open === true ? <Badge tone="green">{t.laundry.openNow}</Badge> : open === false ? <Badge>{t.laundry.closedNow}</Badge> : null}
              {laundry.supports_pickup && <Badge tone="blue">{t.laundry.supportsPickup}</Badge>}
              {laundry.supports_delivery && <Badge tone="blue">{t.laundry.supportsDelivery}</Badge>}
              {laundry.supports_dropoff && <Badge>{t.laundry.supportsDropoff}</Badge>}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Info label={t.laundry.pickupFee} value={Number(laundry.pickup_fee) === 0 ? t.laundry.free : money(laundry.pickup_fee, locale)} />
          <Info label={t.laundry.deliveryFee} value={Number(laundry.delivery_fee) === 0 ? t.laundry.free : money(laundry.delivery_fee, locale)} />
          <Info label={t.laundry.minOrder} value={Number(laundry.min_order) === 0 ? "—" : money(laundry.min_order, locale)} />
          <Info label={t.laundry.prepTime} value={`${laundry.prep_hours} ${t.common.hours}`} />
        </div>
        {laundry.description && <p className="mt-3 text-sm text-slate-600">{laundry.description}</p>}
      </Card>

      {!available && <Alert tone="amber">{t.laundry.unavailable}</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-lg font-bold text-brand-950">{t.laundry.services}</h2>
          {svc.length === 0 ? <EmptyState icon="shirt" title={t.laundry.noServices} /> : cats.map((c) => (
            <Card key={c.id}>
              <CardHeader title={locale === "ur" ? c.name_ur : c.name_ar} />
              <div className="divide-y divide-[var(--line)] px-4">
                {svc.filter((s) => s.category_id === c.id).map((s) => <MenuItem key={s.id} s={s} laundryId={laundry.id} disabled={!available} />)}
              </div>
            </Card>
          ))}

          <Card>
            <CardHeader title={t.laundry.customerReviews} />
            <div className="divide-y divide-[var(--line)] px-4">
              {((reviews as Review[]) ?? []).length === 0 && <p className="py-4 text-sm text-[var(--muted)]">{t.laundry.noReviews}</p>}
              {((reviews as Review[]) ?? []).map((r) => (
                <div key={r.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between"><Stars value={r.rating} /><span className="text-xs text-[var(--muted)]">{dateOnly(r.created_at, locale)}</span></div>
                  {r.comment && <p className="mt-1 text-slate-700">{r.comment}</p>}
                  {r.partner_reply && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-slate-600"><b>{t.laundry.partnerReply}:</b> {r.partner_reply}</p>}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          {((packages as Package[]) ?? []).length > 0 && (
            <Card>
              <CardHeader title={t.laundry.packages} />
              <div className="space-y-3 p-4">
                {((packages as Package[]) ?? []).map((p) => (
                  <div key={p.id} className="rounded-xl bg-brand-50/60 p-3 ring-1 ring-brand-100">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-brand-950">{locale === "ur" && p.name_ur ? p.name_ur : p.name_ar}</p>
                      <span className="font-num font-extrabold text-brand-900">{money(p.price, locale)}</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-sm text-slate-600">
                      <li>• {fmt(t.packages.pieces, { n: p.piece_credits })}</li>
                      {p.max_orders && <li>• {fmt(t.packages.maxOrders, { n: p.max_orders })}</li>}
                      <li>• {fmt(t.packages.validity, { n: p.interval_days })}</li>
                      {p.free_pickup_delivery && <li>• {t.packages.freeDelivery}</li>}
                    </ul>
                    <details className="mt-1.5 text-xs text-slate-500"><summary className="cursor-pointer">{t.packages.terms}</summary><p className="mt-1 whitespace-pre-line">{p.terms}</p><p className="mt-1">{p.overage_note || t.packages.overage}</p></details>
                    {available && (user ? (
                      <ActionForm action={purchasePackageAction} successMessage={t.packages.purchased} className="mt-2">
                        <input type="hidden" name="package_id" value={p.id} />
                        <SubmitButton size="sm" className="w-full">{t.packages.subscribe}</SubmitButton>
                      </ActionForm>
                    ) : (
                      <a href={`/login?next=/laundry/${laundry.id}`} className="mt-2 block text-center text-sm font-semibold text-brand-700">{t.common.signIn}</a>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title={t.laundry.hours} />
            <div className="px-4 py-2">
              {days.map((d, i) => {
                const h = laundry.opening_hours?.[String(i)];
                return <KV key={i} k={d} v={<span className="font-num">{h ? `${h[0]} – ${h[1]}` : t.common.closed}</span>} />;
              })}
            </div>
          </Card>
          <Card className="space-y-2 p-4 text-sm">
            {mapsUrl(laundry.lat, laundry.lng) && <a href={mapsUrl(laundry.lat, laundry.lng)!} target="_blank" rel="noopener" className="flex items-center gap-2 font-semibold text-brand-700"><Icon name="nav" className="size-4.5" />{t.common.navigate}</a>}
            {telUrl(laundry.phone) && <a href={telUrl(laundry.phone)!} className="flex items-center gap-2 font-semibold text-brand-700"><Icon name="phone" className="size-4.5" /><span dir="ltr" className="font-num">{laundry.phone}</span></a>}
          </Card>
        </aside>
      </div>
      <CartBar laundryId={laundry.id} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="font-num font-bold text-brand-950">{value}</p>
    </div>
  );
}
