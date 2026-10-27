import type { Dict } from "@/lib/i18n/shared";

export function DateRangeForm({ from, to, t, exportHref }: { from: string; to: string; t: Dict; exportHref?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="mb-1 block text-[var(--muted)]">{t.common.from}</span>
          <input type="date" name="from" defaultValue={from} className="h-10 rounded-xl bg-white px-2 ring-1 ring-[var(--line)]" dir="ltr" /></label>
        <label className="text-sm"><span className="mb-1 block text-[var(--muted)]">{t.common.to}</span>
          <input type="date" name="to" defaultValue={to} className="h-10 rounded-xl bg-white px-2 ring-1 ring-[var(--line)]" dir="ltr" /></label>
        <button className="h-10 rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white">{t.common.apply}</button>
      </form>
      {exportHref && <a href={exportHref} className="h-10 rounded-xl bg-white px-4 text-sm font-semibold leading-10 text-brand-900 ring-1 ring-[var(--line)]">{t.common.export}</a>}
    </div>
  );
}
