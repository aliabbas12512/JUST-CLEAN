import ar from "@/lib/i18n/ar";

const KNOWN = new Set(Object.keys(ar.errors));

/** Maps a Supabase/Postgres error to an i18n error key. RPCs raise bare codes like "invalid_code". */
export function errorKey(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "generic";
  const msg = (err.message ?? "").trim();
  if (KNOWN.has(msg)) return msg;
  if (err.code === "23505") return "duplicate";
  if (err.code === "28000" || /JWT|not_authenticated/i.test(msg)) return "not_authenticated";
  if (err.code === "42501" || /permission denied|row-level security/i.test(msg)) return "forbidden";
  console.error("[supabase]", err);
  return "generic";
}
