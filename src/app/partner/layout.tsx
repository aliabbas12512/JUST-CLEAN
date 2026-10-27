import { PortalShell } from "@/components/portal/shell";
import type { NavItem } from "@/components/portal/nav";
import { BranchSwitcher } from "@/components/partner/branch-switcher";
import { SetupRequired } from "@/components/setup-required";
import { getActiveLaundry, getMyLaundries, getSession } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  const { supabase, user } = await getSession();
  if (!supabase) return <SetupRequired />;
  const [laundries, active] = await Promise.all([getMyLaundries(), getActiveLaundry()]);

  let pending = 0;
  if (user && active) {
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("laundry_id", active.id).eq("status", "placed");
    pending = count ?? 0;
  }
  const nav: NavItem[] = active ? [
    { href: "/partner", label: t.partner.nav.dashboard, icon: "home", exact: true },
    { href: "/partner/orders", label: t.partner.nav.orders, icon: "list", badge: pending },
    { href: "/partner/services", label: t.partner.nav.services, icon: "shirt" },
    { href: "/partner/packages", label: t.partner.nav.packages, icon: "box" },
    { href: "/partner/subscription", label: t.partner.nav.subscription, icon: "wallet" },
    { href: "/partner/reviews", label: t.partner.nav.reviews, icon: "star" },
    { href: "/partner/reports", label: t.partner.nav.reports, icon: "chart" },
    { href: "/partner/settings", label: t.partner.nav.settings, icon: "settings" },
  ] : [];

  return (
    <PortalShell
      title={t.partner.title}
      nav={nav}
      top={laundries.length > 1 && active ? <BranchSwitcher laundries={laundries.map((l) => ({ id: l.id, name: l.name }))} activeId={active.id} /> : undefined}
    >
      {children}
    </PortalShell>
  );
}
