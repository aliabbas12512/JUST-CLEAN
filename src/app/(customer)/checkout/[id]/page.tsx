import { Checkout } from "@/components/customer/checkout";
import { SetupRequired } from "@/components/setup-required";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import type { City, CustomerPackage, Laundry, Service } from "@/lib/types";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getI18n();
  if (!isSupabaseConfigured) return <SetupRequired />;
  const { id } = await params;
  const { supabase, user, profile } = await requireUser(`/checkout/${id}`);

  const [{ data: l }, { data: services }, { data: cities }, { data: addresses }, { data: pkgs }] = await Promise.all([
    supabase.from("laundries").select("*").eq("id", id).maybeSingle(),
    supabase.from("services").select("*").eq("laundry_id", id).eq("is_active", true),
    supabase.from("cities").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("customer_packages").select("*").eq("customer_id", user.id).eq("laundry_id", id).eq("status", "active"),
  ]);
  const laundry = l as Laundry | null;
  if (!laundry) return <EmptyState icon="store" title={t.laundry.notFound} />;

  return (
    <div>
      <PageHeader title={t.checkout.title} subtitle={laundry.name} back={`/laundry/${id}`} />
      <Checkout
        laundry={{
          id: laundry.id, name: laundry.name, city_id: laundry.city_id, address: laundry.address,
          supports_pickup: laundry.supports_pickup, supports_delivery: laundry.supports_delivery, supports_dropoff: laundry.supports_dropoff,
        }}
        services={(services as Service[]) ?? []}
        cities={(cities as City[]) ?? []}
        addresses={(addresses as AddressRow[]) ?? []}
        packages={(pkgs as CustomerPackage[]) ?? []}
        profile={{ name: profile?.full_name ?? "", phone: profile?.phone ?? "" }}
      />
    </div>
  );
}

export type AddressRow = { id: string; label: string; city_id: number; district_text: string | null; line: string; lat: number | null; lng: number | null; notes: string | null };
