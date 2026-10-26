"use server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/shared";
import { getSession } from "@/lib/auth";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const { supabase, user } = await getSession();
  if (supabase && user) await supabase.from("profiles").update({ locale }).eq("id", user.id);
}
