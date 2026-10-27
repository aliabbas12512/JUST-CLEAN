import { toggleAcceptingAction } from "@/app/actions/partner";
import { LaundryForm } from "@/components/partner/laundry-form";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui/primitives";
import { requireLaundry } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Category, City } from "@/lib/types";

export default async function PartnerSettingsPage() {
  const { t, locale } = await getI18n();
  const { supabase, laundry } = await requireLaundry();
  const [{ data: cities }, { data: categories }, { data: lc }, { data: docs }] = await Promise.all([
    supabase.from("cities").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("laundry_categories").select("category_id").eq("laundry_id", laundry.id),
    supabase.from("laundry_documents").select("*").eq("laundry_id", laundry.id).order("created_at", { ascending: false }),
  ]);
  const kindLabel = { commercial_registration: t.partner.fields.crDoc, municipal_license: t.partner.fields.licenseDoc } as Record<string, string>;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={t.partner.nav.settings} actions={<LinkButton href="/partner/register" variant="secondary" size="sm" icon="plus">{t.partner.addBranch}</LinkButton>} />
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-bold text-brand-950">{t.partner.acceptingOrders}</p>
          <p className="text-sm text-[var(--muted)]">{laundry.accepting_orders ? t.common.active : t.common.inactive}</p>
        </div>
        <ActionForm action={toggleAcceptingAction}>
          <input type="hidden" name="laundry_id" value={laundry.id} />
          <input type="hidden" name="value" value={String(!laundry.accepting_orders)} />
          <SubmitButton variant={laundry.accepting_orders ? "secondary" : "success"}>{laundry.accepting_orders ? t.partner.pauseOrders : t.partner.resumeOrders}</SubmitButton>
        </ActionForm>
      </Card>
      {((docs as { id: string; kind: string; created_at: string }[]) ?? []).length > 0 && (
        <Card>
          <CardHeader title={t.admin.documents} />
          <ul className="divide-y divide-[var(--line)] px-4 text-sm">
            {(docs as { id: string; kind: string; created_at: string }[]).map((d) => (
              <li key={d.id} className="flex justify-between py-2"><span>{kindLabel[d.kind] ?? d.kind}</span><span className="font-num text-[var(--muted)]">{dateTime(d.created_at, locale)}</span></li>
            ))}
          </ul>
        </Card>
      )}
      <LaundryForm laundry={laundry} cities={(cities as City[]) ?? []} categories={(categories as Category[]) ?? []}
        selectedCategories={((lc as { category_id: number }[]) ?? []).map((x) => x.category_id)} defaultRadius={laundry.service_radius_km} />
    </div>
  );
}
