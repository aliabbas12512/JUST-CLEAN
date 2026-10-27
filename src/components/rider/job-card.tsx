import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { money, num, windowLabel } from "@/lib/format";
import type { Dict, Locale } from "@/lib/i18n/shared";
import type { JobLeg, JobStatus } from "@/lib/types";

export type JobLite = { id: string; order_number: string; leg: JobLeg; status?: JobStatus; from_area: string | null; to_area: string | null;
  distance_km?: number | null; rider_fee: number; window_start?: string | null; window_end?: string | null };

export function JobCard({ j, t, locale, href, children }: { j: JobLite; t: Dict; locale: Locale; href?: string; children?: React.ReactNode }) {
  const body = (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[var(--line)]">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={j.leg === "pickup" ? "violet" : "blue"}>{t.rider.legs[j.leg]}</Badge>
        <span className="font-num text-sm text-[var(--muted)]" dir="ltr">{j.order_number}</span>
      </div>
      <div className="mt-3 space-y-1.5 text-[15px]">
        <p className="flex items-center gap-2"><Icon name="pin" className="size-4.5 text-violet-600" /><span className="text-[var(--muted)]">{t.rider.pickupFrom}:</span> <b>{j.from_area || "—"}</b></p>
        <p className="flex items-center gap-2"><Icon name="nav" className="size-4.5 text-brand-600" /><span className="text-[var(--muted)]">{t.rider.deliverTo}:</span> <b>{j.to_area || "—"}</b></p>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-sm text-[var(--muted)]">
        {j.distance_km != null && <span className="font-num">{num(j.distance_km, locale, 1)} {t.common.km}</span>}
        {Number(j.rider_fee) > 0 && <span>{t.rider.fee}: <b className="font-num text-brand-950">{money(j.rider_fee, locale)}</b></span>}
        {j.window_start && <span className="font-num">{windowLabel(j.window_start, j.window_end ?? null, locale)}</span>}
        {j.status && <span>{t.rider.jobStatus[j.status]}</span>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
