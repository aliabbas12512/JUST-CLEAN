import Link from "next/link";
import { brand } from "@/lib/brand";
import { getI18n } from "@/lib/i18n/server";

export async function SiteFooter() {
  const { t, locale } = await getI18n();
  return (
    <footer className="mt-12 border-t border-[var(--line)] bg-white pb-24 md:pb-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} {brand.name[locale]} — {t.footer.rights}</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/partner" className="hover:text-brand-800">{t.nav.forBusiness}</Link>
          <Link href="/rider" className="hover:text-brand-800">{t.nav.becomeRider}</Link>
          <Link href="/support" className="hover:text-brand-800">{t.nav.support}</Link>
          <Link href="/legal/terms" className="hover:text-brand-800">{t.footer.terms}</Link>
          <Link href="/legal/privacy" className="hover:text-brand-800">{t.footer.privacy}</Link>
        </div>
      </div>
    </footer>
  );
}
