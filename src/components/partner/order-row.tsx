import Link from "next/link";
import { OrderStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/primitives";
import { dateTime, money, timeOnly } from "@/lib/format";
import type { Dict, Locale } from "@/lib/i18n/shared";
import type { Order } from "@/lib/types";

export function PartnerOrderRow({ o, t, locale }: { o: Order; t: Dict; locale: Locale }) {
  return (
    <Link href={`/partner/orders/${o.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3.5 ring-1 ring-[var(--line)] hover:bg-slate-50">
      <div className="min-w-0">
        <p className="font-num font-bold text-brand-950" dir="ltr">{o.order_number}</p>
        <p className="truncate text-sm text-[var(--muted)]">
          {o.contact_name} · {t.checkout.methods[o.fulfillment].title} · <span className="font-num">{dateTime(o.created_at, locale)}</span>
        </p>
        {o.status === "placed" && o.accept_deadline && (
          <p className="text-xs font-semibold text-amber-700">⏱ {timeOnly(o.accept_deadline, locale)}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <OrderStatusBadge status={o.status} t={t} />
        <span className="font-num text-sm font-bold">{money(o.final_total ?? o.total, locale)}</span>
        {o.payment_status === "paid" && <Badge tone="green">{t.paymentStatus.paid}</Badge>}
      </div>
    </Link>
  );
}
