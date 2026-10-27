import Link from "next/link";
import { OrderStatusBadge } from "@/components/status-badge";
import { SetupRequired } from "@/components/setup-required";
import { EmptyState, LinkButton, PageHeader, Tabs } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { dateTime, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { CLOSED_STATUSES } from "@/lib/orders";
import type { Order } from "@/lib/types";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { t, locale } = await getI18n();
  if (!isSupabaseConfigured) return <SetupRequired />;
  const { supabase, user } = await requireUser("/orders");
  const tab = (await searchParams).tab === "previous" ? "previous" : "active";
  let q = supabase.from("orders").select("*, laundries(name)").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(100);
  q = tab === "active" ? q.not("status", "in", `(${CLOSED_STATUSES.join(",")})`) : q.in("status", CLOSED_STATUSES);
  const { data } = await q;
  const orders = (data as (Order & { laundries: { name: string } | null })[]) ?? [];

  return (
    <div>
      <PageHeader title={t.order.myOrders} />
      <Tabs active={tab} items={[
        { key: "active", label: t.order.active, href: "/orders" },
        { key: "previous", label: t.order.previous, href: "/orders?tab=previous" },
      ]} />
      {orders.length === 0 ? (
        <EmptyState icon="list" title={t.order.noOrders} body={t.order.noOrdersBody} action={<LinkButton href="/">{t.order.startOrder}</LinkButton>} />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="block rounded-2xl bg-white p-4 ring-1 ring-[var(--line)] hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-brand-950">{o.laundries?.name}</p>
                    <p className="font-num text-sm text-[var(--muted)]" dir="ltr">{o.order_number}</p>
                  </div>
                  <OrderStatusBadge status={o.status} t={t} />
                </div>
                <div className="mt-2 flex justify-between text-sm text-[var(--muted)]">
                  <span>{t.checkout.methods[o.fulfillment].title} · <span className="font-num">{dateTime(o.created_at, locale)}</span></span>
                  <span className="font-num font-bold text-brand-950">{money(o.final_total ?? o.total, locale)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
