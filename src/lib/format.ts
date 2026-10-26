import type { Locale } from "@/lib/i18n/shared";

export const TZ = "Asia/Riyadh";

const intlLocale = (l: Locale) => (l === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "ur-PK-u-ca-gregory-nu-latn");

export function money(amount: number | string | null | undefined, locale: Locale): string {
  const n = Number(amount ?? 0);
  const num = new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  return locale === "ar" ? `${num} ر.س` : `${num} ریال`;
}

export function num(n: number | string | null | undefined, locale: Locale, digits = 0): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(Number(n ?? 0));
}

export function dateTime(v: string | Date | null | undefined, locale: Locale): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(v));
}

export function dateOnly(v: string | Date | null | undefined, locale: Locale): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: TZ }).format(new Date(v));
}

export function timeOnly(v: string | Date | null | undefined, locale: Locale): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { timeStyle: "short", timeZone: TZ }).format(new Date(v));
}

export function windowLabel(start: string | null, end: string | null, locale: Locale): string | null {
  if (!start) return null;
  return `${dateOnly(start, locale)} · ${timeOnly(start, locale)} – ${timeOnly(end, locale)}`;
}

/** Day index (0=Sun) and "HH:MM" for a moment in Riyadh time. */
export function riyadhNow(d = new Date()): { day: number; hm: string; ymd: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { day: days.indexOf(parts.weekday), hm: `${parts.hour}:${parts.minute}`, ymd: `${parts.year}-${parts.month}-${parts.day}` };
}

export function mapsUrl(lat?: number | null, lng?: number | null, label?: string | null): string | null {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (label) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
  return null;
}

export function telUrl(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9+]/g, "");
  return `tel:${digits.startsWith("+") ? digits : "+" + digits}`;
}

export function waUrl(phone?: string | null): string | null {
  if (!phone) return null;
  return `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;
}
