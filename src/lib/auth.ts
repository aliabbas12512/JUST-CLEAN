import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Laundry, Profile, Rider } from "@/lib/types";

export const ACTIVE_LAUNDRY_COOKIE = "pl";

export const getSession = cache(async () => {
  if (!isSupabaseConfigured) return { supabase: null, user: null, profile: null } as const;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  let profile: Profile | null = null;
  if (user) {
    const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    profile = (p as Profile | null) ?? null;
  }
  return { supabase, user, profile } as const;
});

export async function requireUser(next = "/") {
  const s = await getSession();
  if (!s.supabase) redirect("/");
  if (!s.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}

export async function requireAdmin() {
  const s = await requireUser("/admin");
  if (!s.profile?.is_admin) redirect("/");
  return s;
}

export const getMyLaundries = cache(async (): Promise<Laundry[]> => {
  const s = await getSession();
  if (!s.supabase || !s.user) return [];
  const { data } = await s.supabase.from("laundries").select("*").eq("owner_id", s.user.id).order("created_at");
  return (data as Laundry[]) ?? [];
});

/** The partner's currently selected branch (cookie), defaulting to the first. */
export async function getActiveLaundry(): Promise<Laundry | null> {
  const list = await getMyLaundries();
  if (list.length === 0) return null;
  const chosen = (await cookies()).get(ACTIVE_LAUNDRY_COOKIE)?.value;
  return list.find((l) => l.id === chosen) ?? list[0];
}

export async function requireLaundry(): Promise<{ laundry: Laundry } & Awaited<ReturnType<typeof requireUser>>> {
  const s = await requireUser("/partner");
  const laundry = await getActiveLaundry();
  if (!laundry) redirect("/partner/register");
  return { ...s, laundry };
}

export const getMyRider = cache(async (): Promise<Rider | null> => {
  const s = await getSession();
  if (!s.supabase || !s.user) return null;
  const { data } = await s.supabase.from("riders").select("*").eq("id", s.user.id).maybeSingle();
  return (data as Rider | null) ?? null;
});
