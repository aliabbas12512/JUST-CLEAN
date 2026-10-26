import { LaundryForm } from "@/components/partner/laundry-form";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import type { Category, City } from "@/lib/types";

export default async function RegisterLaundryPage() {
  const { t, locale } = await getI18n();
  const { supabase } = await requireUser("/partner/register");
  const [{ data: cities }, { data: categories }, { data: settings }] = await Promise.all([
    supabase.from("cities").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("platform_settings").select("partner_subscription_price, default_service_radius_km").maybeSingle(),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.partner.registerTitle} subtitle={t.partner.registerSubtitle} />
      <div className="mb-4"><Alert tone="blue">{fmt(t.partner.pricingNote, { price: money(settings?.partner_subscription_price ?? 100, locale) })}</Alert></div>
      <LaundryForm laundry={null} cities={(cities as City[]) ?? []} categories={(categories as Category[]) ?? []} selectedCategories={[]} defaultRadius={Number(settings?.default_service_radius_km ?? 5)} />
    </div>
  );
}
