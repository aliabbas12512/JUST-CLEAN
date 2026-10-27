import { riyadhNow } from "@/lib/format";

export const SLOTS = [
  ["09:00", "12:00"],
  ["12:00", "15:00"],
  ["15:00", "18:00"],
  ["18:00", "21:00"],
  ["21:00", "23:59"],
] as const;

/** Next N days (Riyadh calendar) as YYYY-MM-DD. */
export function upcomingDays(n = 7, now = new Date()): string[] {
  const [y, m, d] = riyadhNow(now).ymd.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

export function slotIso(day: string, hm: string): string {
  return `${day}T${hm}:00+03:00`;
}

/** Slots still available on a given day (at least 30 minutes ahead). */
export function availableSlots(day: string, now = new Date()) {
  const cutoff = now.getTime() + 30 * 60 * 1000;
  return SLOTS.filter(([, end]) => new Date(slotIso(day, end)).getTime() > cutoff);
}
