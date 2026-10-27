"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/client";

export function BottomNav() {
  const { t } = useI18n();
  const path = usePathname();
  const items: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: t.nav.home, icon: "home" },
    { href: "/orders", label: t.nav.orders, icon: "list" },
    { href: "/packages", label: t.nav.packages, icon: "box" },
    { href: "/account", label: t.nav.account, icon: "user" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-4">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link href={it.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? "text-brand-800" : "text-slate-500"}`}>
                <Icon name={it.icon} className="size-5.5" />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
