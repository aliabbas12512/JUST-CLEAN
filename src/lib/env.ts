// Public Supabase project for Just Clean. The URL and publishable key are designed to be
// shipped to browsers (Row Level Security protects the data), so they are safe defaults here.
// Override with env vars to point at another project (e.g. local `supabase start`).
const DEFAULT_SUPABASE_URL = "https://sfxnxbgmkbjoqsknmihp.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BLZV239QcgC4H-A7JiJkzw_cCCTW0F2";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const isServiceRoleConfigured = Boolean(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const isOnlinePaymentConfigured = Boolean(process.env.MOYASAR_SECRET_KEY && isServiceRoleConfigured);

export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
