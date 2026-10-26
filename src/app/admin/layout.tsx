import { PortalShell } from "@/components/portal/shell";
import type { NavItem } from "@/components/portal/nav";
import { SetupRequired } from "@/components/setup-required";
import { isSupabaseConfigured } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  if (!isSupabaseConfigured) return <SetupRequired />;
  const { supabase } = await requireAdmin();
  const [{ count: pendingLaundries }, { count: pendingPayments }, { count: pendingRiders }, { count: openTickets }] = await Promise.all([
    supabase.from("laundries").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending").eq("kind", "partner_subscription"),
    supabase.from("riders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
  ]);
  const n = t.admin.nav;
  const nav: NavItem[] = [
    { href: "/admin", label: n.overview, icon: "chart", exact: true },
    { href: "/admin/laundries", label: n.laundries, icon: "store", badge: pendingLaundries ?? 0 },
    { href: "/admin/riders", label: n.riders, icon: "bike", badge: pendingRiders ?? 0 },
    { href: "/admin/orders", label: n.orders, icon: "list" },
    { href: "/admin/payments", label: n.payments, icon: "wallet", badge: pendingPayments ?? 0 },
    { href: "/admin/subscriptions", label: n.subscriptions, icon: "refresh" },
    { href: "/admin/reports", label: n.reports, icon: "chart" },
    { href: "/admin/reviews", label: n.reviews, icon: "star" },
    { href: "/admin/promos", label: n.promos, icon: "tag" },
    { href: "/admin/support", label: n.support, icon: "support", badge: openTickets ?? 0 },
    { href: "/admin/locations", label: n.locations, icon: "pin" },
    { href: "/admin/settings", label: n.settings, icon: "settings" },
    { href: "/admin/audit", label: n.audit, icon: "shield" },
  ];
  return <PortalShell title={t.admin.title} nav={nav}>{children}</PortalShell>;
}
