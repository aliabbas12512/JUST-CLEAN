import Image from "next/image";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { getSession } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { Icon } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/primitives";
import { LanguageSwitch } from "./language-switch";

export async function SiteHeader() {
  const { t, locale } = await getI18n();
  const { supabase, user } = await getSession();
  let unread = 0;
  if (supabase && user) {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    unread = count ?? 0;
  }
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src={brand.logo} alt={brand.latinName} width={40} height={40} className="size-10 rounded-lg" priority />
          <span className="text-lg font-extrabold text-brand-900">{brand.name[locale]}</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <Link href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t.nav.home}</Link>
          <Link href="/orders" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t.nav.orders}</Link>
          <Link href="/packages" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t.nav.packages}</Link>
          <Link href="/partner" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t.nav.forBusiness}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitch className="hidden sm:inline-flex" />
          {user ? (
            <>
              <Link href="/notifications" className="relative rounded-lg p-2 text-brand-900 hover:bg-slate-50" aria-label={t.nav.notifications}>
                <Icon name="bell" />
                {unread > 0 && (
                  <span className="font-num absolute -top-0.5 -end-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
                )}
              </Link>
              <LinkButton href="/account" variant="secondary" size="sm" icon="user" className="hidden md:inline-flex">{t.nav.account}</LinkButton>
            </>
          ) : (
            <LinkButton href="/login" size="sm">{t.common.signIn}</LinkButton>
          )}
        </div>
      </div>
      <div className="flex justify-center border-t border-[var(--line)] py-1.5 sm:hidden">
        <LanguageSwitch />
      </div>
    </header>
  );
}
