import { reviewRiderAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Badge, Card, EmptyState, Input, PageHeader, Select, Tabs } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { displayPhone } from "@/lib/phone";
import { riderTone } from "@/lib/tones";
import type { City, Rider } from "@/lib/types";

export default async function AdminRiders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const tab = (await searchParams).status ?? "pending";
  let q = supabase.from("riders").select("*").order("created_at", { ascending: false }).limit(200);
  if (tab !== "all") q = q.eq("status", tab);
  const [{ data }, { data: cities }] = await Promise.all([q, supabase.from("cities").select("*")]);
  const riders = (data as Rider[]) ?? [];
  const cityName = (id: number) => { const c = ((cities as City[]) ?? []).find((x) => x.id === id); return c ? (locale === "ur" ? c.name_ur : c.name_ar) : ""; };
  const docs = await Promise.all(riders.map(async (r) => {
    const sign = async (p: string | null) => (p ? (await supabase.storage.from("rider-docs").createSignedUrl(p, 600)).data?.signedUrl ?? null : null);
    return { id: r.id, idDoc: await sign(r.id_document_path), license: await sign(r.license_document_path) };
  }));
  const rs = t.rider.statusLabels;
  return (
    <div>
      <PageHeader title={t.admin.nav.riders} />
      <Tabs active={tab} items={["pending", "active", "suspended", "rejected", "all"].map((k) => ({ key: k, label: k === "all" ? t.common.all : rs[k as keyof typeof rs], href: `/admin/riders?status=${k}` }))} />
      {riders.length === 0 ? <EmptyState icon="bike" title={t.common.none} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {riders.map((r) => {
            const d = docs.find((x) => x.id === r.id);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-brand-950">{r.full_name}</p>
                    <p className="text-sm text-[var(--muted)]"><span className="font-num" dir="ltr">{displayPhone(r.phone)}</span> · {cityName(r.city_id)} · {t.rider.vehicles[r.vehicle_type]}</p>
                    <p className="font-num text-xs text-[var(--muted)]">{r.national_id ?? "—"} · {r.vehicle_plate ?? "—"} · {dateTime(r.created_at, locale)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={riderTone[r.status]}>{rs[r.status]}</Badge>
                    {r.status === "active" && <Badge tone={r.is_online ? "green" : "gray"}>{r.is_online ? t.rider.online : t.rider.offline}</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex gap-3 text-sm">
                  {d?.idDoc && <a href={d.idDoc} target="_blank" rel="noopener" className="font-semibold text-brand-700">{t.rider.idDoc}</a>}
                  {d?.license && <a href={d.license} target="_blank" rel="noopener" className="font-semibold text-brand-700">{t.rider.licenseDoc}</a>}
                </div>
                <ActionForm action={reviewRiderAction} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <Select name="status" defaultValue={r.status === "active" ? "suspended" : "active"} className="w-auto">
                    <option value="active">{t.admin.approve}</option>
                    <option value="suspended">{t.admin.suspend}</option>
                    <option value="rejected">{t.admin.reject}</option>
                  </Select>
                  <Input name="notes" placeholder={t.admin.reviewNotes} className="min-w-0 flex-1" />
                  <SubmitButton size="sm" confirmText={t.common.areYouSure}>{t.common.apply}</SubmitButton>
                </ActionForm>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
