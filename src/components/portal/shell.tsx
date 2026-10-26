import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/lib/brand";
import { getI18n } from "@/lib/i18n/server";
import { LanguageSwitch } from "@/components/site/language-switch";
import { Icon } from "@/components/ui/icon";
import { PortalNav, type NavItem } from "./nav";

export async function PortalShell({ title, nav, children, top }: { title: string; nav: NavItem[]; children: ReactNode; top?: ReactNode }) {
  const { t, locale } = await getI18n();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src={brand.logo} alt="" width={32} height={32} className="size-8 rounded-md" />
            <span className="font-extrabold text-brand-900">{brand.name[locale]}</span>
            <span className="hidden rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 sm:inline">{title}</span>
          </Link>
          <div className="flex items-center gap-2">
            {top}
            <LanguageSwitch />
            <Link href="/account" className="rounded-lg p-2 text-brand-900 hover:bg-slate-50" aria-label={t.nav.account}><Icon name="user" /></Link>
          </div>
        </div>
        {nav.length > 0 && (
          <div className="border-t border-[var(--line)] lg:hidden">
            <PortalNav items={nav} variant="mobile" />
          </div>
        )}
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5">
        {nav.length > 0 && (
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-20"><PortalNav items={nav} variant="desktop" /></div>
          </aside>
        )}
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
