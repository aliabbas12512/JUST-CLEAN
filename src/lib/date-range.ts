import { riyadhNow } from "@/lib/format";

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD (Riyadh days), defaulting to the current month. */
export function parseRange(sp: { from?: string; to?: string }) {
  const { ymd } = riyadhNow();
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const from = valid(sp.from) ?? `${ymd.slice(0, 7)}-01`;
  const to = valid(sp.to) ?? ymd;
  return { from, to, fromIso: `${from}T00:00:00+03:00`, toIso: `${to}T23:59:59.999+03:00` };
}
