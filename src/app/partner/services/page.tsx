import { deleteServiceAction, toggleServiceAction } from "@/app/actions/partner";
import { ServiceForm } from "@/components/partner/service-form";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireLaundry } from "@/lib/auth";
import { money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Category, Service } from "@/lib/types";

export default async function PartnerServicesPage() {
  const { t, locale } = await getI18n();
  const { supabase, laundry } = await requireLaundry();
  const [{ data: services }, { data: categories }] = await Promise.all([
    supabase.from("services").select("*").eq("laundry_id", laundry.id).order("category_id").order("sort_order").order("created_at"),
    supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
  ]);
  const list = (services as Service[]) ?? [];
  const cats = (categories as Category[]) ?? [];
  const catName = (id: number) => { const c = cats.find((x) => x.id === id); return c ? (locale === "ur" ? c.name_ur : c.name_ar) : ""; };
  const s = t.partner.services;

  return (
    <div className="space-y-4">
      <PageHeader title={s.title} />
      <Alert tone="blue">{s.priceNote}</Alert>
      <Card>
        <CardHeader title={s.add} />
        <div className="p-4"><ServiceForm categories={cats} /></div>
      </Card>
      {list.length === 0 ? <EmptyState icon="shirt" title={s.empty} /> : (
        <div className="space-y-2">
          {list.map((sv) => (
            <details key={sv.id} className="rounded-2xl bg-white ring-1 ring-[var(--line)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-bold text-brand-950">{sv.name_ar}{sv.name_ur && <span className="text-sm font-normal text-[var(--muted)]"> · {sv.name_ur}</span>}</p>
                  <p className="text-sm text-[var(--muted)]">{catName(sv.category_id)} · {sv.pricing_model === "quote" ? t.pricing.quote : <><span className="font-num">{money(sv.price, locale)}</span> {t.pricing[sv.pricing_model]}</>}</p>
                </div>
                {!sv.is_active && <Badge>{s.hidden}</Badge>}
              </summary>
              <div className="space-y-3 border-t border-[var(--line)] p-4">
                <ServiceForm service={sv} categories={cats} />
                <div className="flex gap-2 border-t border-[var(--line)] pt-3">
                  <ActionForm action={toggleServiceAction}>
                    <input type="hidden" name="id" value={sv.id} /><input type="hidden" name="value" value={String(!sv.is_active)} />
                    <SubmitButton variant="secondary" size="sm">{sv.is_active ? s.hidden : t.common.active}</SubmitButton>
                  </ActionForm>
                  <ActionForm action={deleteServiceAction}>
                    <input type="hidden" name="id" value={sv.id} />
                    <SubmitButton variant="ghost" size="sm" icon="trash" confirmText={t.common.areYouSure}>{t.common.delete}</SubmitButton>
                  </ActionForm>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
