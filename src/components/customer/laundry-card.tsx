import Image from "next/image";
import Link from "next/link";
import { Badge, Stars } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { money, num } from "@/lib/format";
import { isOpenNow } from "@/lib/hours";
import { fmt, type Dict, type Locale } from "@/lib/i18n/shared";
import { publicLogoUrl } from "@/lib/storage";
import type { NearbyLaundry } from "@/lib/types";
import { FavoriteButton } from "./favorite-button";

export function LaundryCard({ l, t, locale, isFavorite, canFavorite }:
  { l: NearbyLaundry; t: Dict; locale: Locale; isFavorite: boolean; canFavorite: boolean }) {
  const logo = publicLogoUrl(l.logo_path);
  const open = isOpenNow(l.opening_hours);
  return (
    <div className="group relative flex flex-col rounded-2xl bg-white p-4 ring-1 ring-[var(--line)] transition-shadow hover:shadow-md">
      <div className="flex gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-brand-50">
          {logo ? <Image src={logo} alt="" fill sizes="64px" className="object-cover" /> : (
            <div className="flex size-full items-center justify-center text-brand-700"><Icon name="shirt" className="size-8" /></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/laundry/${l.id}`} className="line-clamp-1 font-bold text-brand-950 after:absolute after:inset-0">{l.name}</Link>
            {canFavorite && <div className="relative z-10"><FavoriteButton laundryId={l.id} initial={isFavorite} /></div>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
            {l.rating_count > 0 ? <Stars value={l.rating_avg} count={l.rating_count} /> : <span>{t.laundry.noReviews}</span>}
            {l.distance_km != null && (
              <span className="inline-flex items-center gap-1"><Icon name="pin" className="size-4" />
                <span className="font-num">{fmt(t.laundry.away, { d: num(l.distance_km, locale, 1) })}</span></span>
            )}
            <span className="inline-flex items-center gap-1"><Icon name="clock" className="size-4" />
              <span className="font-num">{l.prep_hours} {t.common.hours}</span></span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {open === true && <Badge tone="green">{t.laundry.openNow}</Badge>}
        {open === false && <Badge tone="gray">{t.laundry.closedNow}</Badge>}
        {l.supports_pickup && <Badge tone="blue">{t.laundry.supportsPickup}</Badge>}
        {l.supports_delivery && <Badge tone="blue">{t.laundry.supportsDelivery}</Badge>}
        {l.supports_dropoff && <Badge tone="gray">{t.laundry.supportsDropoff}</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[var(--muted)]">
          {l.starting_price != null && <span>{t.laundry.startingFrom} <b className="font-num text-brand-950">{money(l.starting_price, locale)}</b></span>}
          <span>{t.laundry.deliveryFee}: <b className="font-num text-brand-950">{Number(l.delivery_fee) === 0 ? t.laundry.free : money(l.delivery_fee, locale)}</b></span>
          {Number(l.min_order) > 0 && <span>{t.laundry.minOrder}: <b className="font-num text-brand-950">{money(l.min_order, locale)}</b></span>}
        </div>
        <span className="inline-flex items-center gap-1 font-semibold text-brand-700">{t.laundry.viewServices}<Icon name="chevron" className="size-4" /></span>
      </div>
    </div>
  );
}
