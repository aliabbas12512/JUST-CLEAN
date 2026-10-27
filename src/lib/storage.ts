import { SUPABASE_URL } from "@/lib/env";

export function publicLogoUrl(path: string | null | undefined): string | null {
  if (!path || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/laundry-logos/${path}`;
}
