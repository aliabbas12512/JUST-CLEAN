import { Icon } from "@/components/ui/icon";
import { dateTime } from "@/lib/format";
import type { Dict, Locale } from "@/lib/i18n/shared";
import { stepsFor } from "@/lib/orders";
import type { Fulfillment, OrderEvent, OrderStatus } from "@/lib/types";

export function OrderTimeline({ fulfillment, status, events, t, locale }:
  { fulfillment: Fulfillment; status: OrderStatus; events: OrderEvent[]; t: Dict; locale: Locale }) {
  const steps = stepsFor(fulfillment);
  const terminal = status === "cancelled" || status === "rejected";
  // Furthest status reached according to the event log (handles rollbacks such as failed delivery).
  const reached = new Set(events.map((e) => e.status).filter(Boolean) as OrderStatus[]);
  const currentIdx = steps.indexOf(status);
  const lastTime = (s: OrderStatus) => [...events].reverse().find((e) => e.status === s)?.created_at;

  return (
    <div>
      <ol className="relative space-y-0">
        {steps.map((s, i) => {
          const done = !terminal && (i < currentIdx || (i === currentIdx && s === "completed"));
          const current = !terminal && i === currentIdx && s !== "completed";
          const past = terminal && reached.has(s);
          const time = lastTime(s);
          return (
            <li key={s} className="flex gap-3 pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <span className={`flex size-7 items-center justify-center rounded-full ring-2 ${
                  done || past ? "bg-emerald-500 text-white ring-emerald-500" : current ? "bg-brand-700 text-white ring-brand-200" : "bg-white text-slate-300 ring-slate-200"}`}>
                  {done || past ? <Icon name="check" className="size-4" /> : <span className="size-2 rounded-full bg-current" />}
                </span>
                {i < steps.length - 1 && <span className={`mt-1 w-0.5 flex-1 ${done || past ? "bg-emerald-300" : "bg-slate-200"}`} />}
              </div>
              <div className="-mt-0.5 pb-1">
                <p className={`text-sm font-semibold ${current ? "text-brand-800" : done || past ? "text-brand-950" : "text-slate-400"}`}>{t.status[s]}</p>
                {time && (done || current || past) && <p className="font-num text-xs text-[var(--muted)]">{dateTime(time, locale)}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {terminal && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t.status[status]}</p>
      )}
    </div>
  );
}

export function EventLog({ events, t, locale }: { events: OrderEvent[]; t: Dict; locale: Locale }) {
  return (
    <ul className="space-y-2 text-sm">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="flex justify-between gap-3">
          <span>
            {(t.events as Record<string, string>)[e.event] ?? e.event}
            {e.note && <span className="text-[var(--muted)]"> — {e.note}</span>}
          </span>
          <span className="font-num shrink-0 text-xs text-[var(--muted)]">{dateTime(e.created_at, locale)}</span>
        </li>
      ))}
    </ul>
  );
}
