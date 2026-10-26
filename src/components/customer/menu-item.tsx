"use client";
import { Icon } from "@/components/ui/icon";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/shared";
import type { Service } from "@/lib/types";
import { useCart } from "./cart";

export function stepFor(model: Service["pricing_model"]) {
  return model === "per_kg" ? 0.5 : 1;
}

export function MenuItem({ s, laundryId, disabled }: { s: Service; laundryId: string; disabled: boolean }) {
  const { t, locale } = useI18n();
  const { cart, setQty } = useCart();
  const qty = cart.laundryId === laundryId ? cart.items[s.id]?.qty ?? 0 : 0;
  const step = stepFor(s.pricing_model);
  const name = locale === "ur" && s.name_ur ? s.name_ur : s.name_ar;
  const change = (n: number) => setQty(laundryId, s.id, Math.max(0, n), () => window.confirm(t.cart.otherLaundry));

  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-brand-950">{name}</p>
        {s.description && <p className="mt-0.5 text-sm text-[var(--muted)]">{s.description}</p>}
        <p className="mt-1 text-sm">
          {s.pricing_model === "quote" ? (
            <span className="font-semibold text-amber-700">{t.laundry.quote}</span>
          ) : (
            <>
              <span className="font-num font-bold text-brand-900">{money(s.price, locale)}</span>{" "}
              <span className="text-[var(--muted)]">{s.unit_label ? `/ ${s.unit_label}` : t.pricing[s.pricing_model]}</span>
            </>
          )}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--muted)]">
          {s.turnaround_hours && <span>{fmt(t.laundry.turnaround, { h: s.turnaround_hours })}</span>}
          {s.restrictions && <span className="text-amber-700">{s.restrictions}</span>}
        </div>
      </div>
      {disabled ? null : qty === 0 ? (
        <button type="button" onClick={() => change(s.pricing_model === "per_kg" ? 1 : 1)}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-brand-50 px-3 text-sm font-bold text-brand-800 hover:bg-brand-100">
          <Icon name="plus" className="size-4" />{t.laundry.addToCart}
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-900 p-1 text-white">
          <button type="button" aria-label="-" onClick={() => change(qty - step)} className="rounded-lg p-1.5 hover:bg-white/10"><Icon name="minus" className="size-4" /></button>
          <span className="font-num min-w-8 text-center text-sm font-bold">{qty}{s.pricing_model === "per_kg" ? ` ${t.cart.kg}` : ""}</span>
          <button type="button" aria-label="+" onClick={() => change(qty + step)} className="rounded-lg p-1.5 hover:bg-white/10"><Icon name="plus" className="size-4" /></button>
        </div>
      )}
    </div>
  );
}

export function CartBar({ laundryId }: { laundryId: string }) {
  const { t } = useI18n();
  const { cart, count } = useCart();
  if (cart.laundryId !== laundryId || count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-16 z-20 px-4 md:bottom-4">
      <a href={`/checkout/${laundryId}`}
        className="mx-auto flex h-14 max-w-xl items-center justify-between rounded-2xl bg-brand-900 px-5 font-bold text-white shadow-lg hover:bg-brand-800">
        <span className="font-num rounded-lg bg-white/15 px-2 py-0.5 text-sm">{fmt(t.cart.items, { n: count })}</span>
        <span>{t.cart.viewCart}</span>
        <Icon name="chevron" className="size-5" />
      </a>
    </div>
  );
}
