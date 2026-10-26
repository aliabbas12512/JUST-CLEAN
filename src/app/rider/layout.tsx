import { PortalShell } from "@/components/portal/shell";
import { SetupRequired } from "@/components/setup-required";
import { getMyRider, getSession } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  const { supabase } = await getSession();
  if (!supabase) return <SetupRequired />;
  const rider = await getMyRider();
  const nav = rider?.status === "active" ? [
    { href: "/rider", label: t.rider.title, icon: "bike" as const, exact: true },
    { href: "/rider/history", label: t.rider.history, icon: "list" as const },
  ] : [];
  return <PortalShell title={t.rider.title} nav={nav}><div className="mx-auto max-w-2xl">{children}</div></PortalShell>;
}
