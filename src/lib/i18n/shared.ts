import ar, { type Dict } from "./ar";
import ur from "./ur";

export const LOCALES = ["ar", "ur"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "lang";

const dicts: Record<Locale, Dict> = { ar, ur };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function dictFor(locale: Locale): Dict {
  return dicts[locale];
}

// Both supported languages are right-to-left.
export function dirFor(_locale: Locale): "rtl" | "ltr" {
  return "rtl";
}

/** Replaces {key} placeholders. */
export function fmt(template: string, params: Record<string, string | number | null | undefined> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] ?? "").toString());
}

export type { Dict };
