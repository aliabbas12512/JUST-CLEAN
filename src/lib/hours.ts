import { riyadhNow } from "@/lib/format";

/** opening_hours: { "0": ["08:00","23:00"], ... } keyed by day (0 = Sunday). Missing/null = closed. */
export type OpeningHours = Record<string, [string, string] | null>;

export function isOpenNow(hours: OpeningHours | null | undefined, now = new Date()): boolean | null {
  if (!hours || Object.keys(hours).length === 0) return null; // unknown
  const { day, hm } = riyadhNow(now);
  const today = hours[String(day)];
  if (today && inRange(hm, today[0], today[1])) return true;
  // Overnight shift from yesterday (e.g. 16:00–02:00).
  const y = hours[String((day + 6) % 7)];
  if (y && y[1] < y[0] && hm < y[1]) return true;
  return false;
}

function inRange(hm: string, open: string, close: string): boolean {
  if (close > open) return hm >= open && hm < close;
  return hm >= open; // closes after midnight
}
