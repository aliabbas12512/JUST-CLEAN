/** Normalizes Saudi mobile input (5XXXXXXXX, 05XXXXXXXX, +9665XXXXXXXX) to E.164 without "+": 9665XXXXXXXX. */
export function normalizeSaudiPhone(input: string): string | null {
  const d = input.replace(/[^0-9]/g, "").replace(/^00/, "");
  let local: string | null = null;
  if (/^9665\d{8}$/.test(d)) local = d.slice(3);
  else if (/^05\d{8}$/.test(d)) local = d.slice(1);
  else if (/^5\d{8}$/.test(d)) local = d;
  return local ? `966${local}` : null;
}

export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/[^0-9]/g, "");
  return d.startsWith("966") ? `0${d.slice(3)}` : e164;
}
