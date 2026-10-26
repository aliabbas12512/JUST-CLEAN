import { KV } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import { fmt, type Dict, type Locale } from "@/lib/i18n/shared";
import type { Order, OrderItem } from "@/lib/types";

export function ItemsList({ items, t, locale }: { items: OrderItem[]; t: Dict; locale: Locale }) {
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((it) => (
        <li key={it.id} className="flex justify-between gap-3 py-2 text-sm">
          <div>
            <p className="font-semibold text-brand-950">
              <span className="font-num">{Number(it.quantity)}×</span> {it.name_snapshot}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {it.pricing_model === "quote" ? t.laundry.quote : <><span className="font-num">{money(it.unit_price, locale)}</span> {t.pricing[it.pricing_model]}</>}
              {it.covered_by_package > 0 && <> · {fmt(t.checkout.packageCredit, { n: it.covered_by_package })}</>}
            </p>
            {it.instructions && <p className="mt-0.5 text-xs text-amber-700">“{it.instructions}”</p>}
          </div>
          <span className="font-num shrink-0 font-semibold">{money(it.line_total, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PriceBreakdown({ o, t, locale }: { o: Order; t: Dict; locale: Locale }) {
  return (
    <div>
      <KV k={t.checkout.subtotal} v={<span className="font-num">{money(o.subtotal, locale)}</span>} />
      {Number(o.package_credit) > 0 && <KV k={fmt(t.checkout.packageCredit, { n: o.package_pieces })} v={<span className="font-num text-emerald-700">−{money(o.package_credit, locale)}</span>} />}
      {Number(o.pickup_fee) > 0 && <KV k={t.checkout.pickupFee} v={<span className="font-num">{money(o.pickup_fee, locale)}</span>} />}
      {Number(o.delivery_fee) > 0 && <KV k={t.checkout.deliveryFee} v={<span className="font-num">{money(o.delivery_fee, locale)}</span>} />}
      {Number(o.discount) > 0 && <KV k={t.checkout.discount} v={<span className="font-num text-emerald-700">−{money(o.discount, locale)}</span>} />}
      <div className="mt-1 border-t border-[var(--line)] pt-2">
        <KV k={<b>{o.is_estimate ? t.checkout.estimatedTotal : t.checkout.total}</b>} v={<b className="font-num text-base">{money(o.total, locale)}</b>} />
        {o.final_total != null && (
          <KV k={<b>{t.order.finalTotal}</b>} v={<b className={`font-num text-base ${o.adjustment_status === "approved" ? "text-emerald-700" : "text-amber-700"}`}>{money(o.final_total, locale)}</b>} />
        )}
        {Number(o.vat_included) > 0 && <p className="text-xs text-[var(--muted)]">{t.checkout.vatIncluded}: <span className="font-num">{money(o.vat_included, locale)}</span></p>}
      </div>
    </div>
  );
}
