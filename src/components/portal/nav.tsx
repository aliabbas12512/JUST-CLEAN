"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean };

export function PortalNav({ items, variant }: { items: NavItem[]; variant: "mobile" | "desktop" }) {
  const path = usePathname();
  const isActive = (it: NavItem) => (it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/"));
  if (variant === "mobile") {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 py-1.5">
        {items.map((it) => (
          <Link key={it.href} href={it.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${isActive(it) ? "bg-brand-900 text-white" : "text-slate-600"}`}>
            <Icon name={it.icon} className="size-4" />{it.label}
            {!!it.badge && <span className="font-num rounded-full bg-red-600 px-1.5 text-[11px] text-white">{it.badge}</span>}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="space-y-1">
      {items.map((it) => (
        <Link key={it.href} href={it.href}
          className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${isActive(it) ? "bg-brand-900 text-white" : "text-slate-600 hover:bg-white"}`}>
          <Icon name={it.icon} className="size-4.5" />
          <span className="flex-1">{it.label}</span>
          {!!it.badge && <span className="font-num rounded-full bg-red-600 px-1.5 text-[11px] text-white">{it.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
