import { recordSubscriptionPaymentAction, reviewLaundryAction, setLaundryActiveAction, setSubscriptionStatusAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Alert, Badge, Card, CardHeader, EmptyState, Field, Input, KV, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { dateOnly, dateTime, mapsUrl, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { displayPhone } from "@/lib/phone";
import { laundryStatusTone, subscriptionTone } from "@/lib/tones";
import type { Laundry, PartnerSubscription } from "@/lib/types";

export default async function AdminLaundryPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = await getI18n();
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: l } = await supabase.from("laundries").select("*").eq("id", id).maybeSingle();
  const laundry = l as Laundry | null;
  if (!laundry) return <EmptyState title={t.errors.not_found} />;
  const [{ data: docs }, { data: sub }, { count: servicesCount }, { count: ordersCount }, { data: owner }, { data: cats }] = await Promise.all([
    supabase.from("laundry_documents").select("*").eq("laundry_id", id).order("created_at", { ascending: false }),
    supabase.from("partner_subscriptions").select("*").eq("laundry_id", id).maybeSingle(),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("laundry_id", id),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("laundry_id", id),
    supabase.from("profiles").select("full_name, phone, email").eq("id", laundry.owner_id).maybeSingle(),
    supabase.from("laundry_categories").select("service_categories(name_ar, name_ur)").eq("laundry_id", id),
  ]);
  const docList = (docs as { id: string; kind: string; storage_path: string; created_at: string }[]) ?? [];
  const signed = await Promise.all(docList.map(async (d) => {
    const { data } = await supabase.storage.from("partner-docs").createSignedUrl(d.storage_path, 600);
    return { ...d, url: data?.signedUrl ?? null };
  }));
  const s = sub as PartnerSubscription | null;
  const a = t.admin;
  const kindLabel: Record<string, string> = { commercial_registration: t.partner.fields.crDoc, municipal_license: t.partner.fields.licenseDoc };

  return (
    <div className="space-y-4">
      <PageHeader back="/admin/laundries" title={laundry.name}
        actions={<><Badge tone={laundryStatusTone[laundry.status]}>{t.laundryStatus[laundry.status]}</Badge>{!laundry.is_active && <Badge tone="red">{a.metrics.suspended}</Badge>}</>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={t.common.details} />
            <div className="grid gap-x-6 px-4 py-2 sm:grid-cols-2">
              <KV k={t.partner.fields.representativeName} v={laundry.representative_name} />
              <KV k={t.partner.fields.phone} v={<span className="font-num" dir="ltr">{displayPhone(laundry.phone)}</span>} />
              <KV k={a.owner} v={<span>{owner?.full_name ?? "—"} <span className="font-num" dir="ltr">{displayPhone(owner?.phone) || owner?.email}</span></span>} />
              <KV k={t.partner.fields.crNumber} v={<span className="font-num">{laundry.cr_number ?? "—"}</span>} />
              <KV k={t.partner.fields.vatNumber} v={<span className="font-num">{laundry.vat_number ?? "—"}</span>} />
              <KV k={t.common.address} v={[laundry.district_text, laundry.address].filter(Boolean).join(" · ")} />
              <KV k={t.partner.fields.radius} v={<span className="font-num">{laundry.service_radius_km}</span>} />
              <KV k={t.partner.nav.services} v={<span className="font-num">{servicesCount ?? 0}</span>} />
              <KV k={t.partner.nav.orders} v={<span className="font-num">{ordersCount ?? 0}</span>} />
              <KV k={t.partner.fields.pickupFee} v={<span className="font-num">{money(laundry.pickup_fee, locale)}</span>} />
              <KV k={t.partner.fields.deliveryFee} v={<span className="font-num">{money(laundry.delivery_fee, locale)}</span>} />
              <KV k={t.partner.fields.iban} v={<span className="font-num" dir="ltr">{laundry.settlement_iban ?? "—"}</span>} />
              <KV k={t.partner.fields.acceptTerms.slice(0, 20) + "…"} v={laundry.terms_accepted_at ? dateTime(laundry.terms_accepted_at, locale) : "—"} />
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-4">
              {((cats ?? []) as unknown as { service_categories: { name_ar: string; name_ur: string } | null }[]).map((c, i) => (
                <Badge key={i} tone="blue">{locale === "ur" ? c.service_categories?.name_ur : c.service_categories?.name_ar}</Badge>
              ))}
              {mapsUrl(laundry.lat, laundry.lng) && <a href={mapsUrl(laundry.lat, laundry.lng)!} target="_blank" rel="noopener" className="text-sm font-semibold text-brand-700">{t.common.navigate}</a>}
            </div>
          </Card>
          <Card>
            <CardHeader title={a.documents} />
            <ul className="divide-y divide-[var(--line)] px-4 text-sm">
              {signed.length === 0 && <li className="py-3 text-[var(--muted)]">{a.noDocuments}</li>}
              {signed.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <span>{kindLabel[d.kind] ?? d.kind} · <span className="font-num text-[var(--muted)]">{dateTime(d.created_at, locale)}</span></span>
                  {d.url && <a href={d.url} target="_blank" rel="noopener" className="font-semibold text-brand-700">{t.common.view}</a>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <p className="mb-3 font-bold text-brand-950">{a.review}</p>
            {laundry.review_notes && <div className="mb-3"><Alert tone="blue">{laundry.review_notes}</Alert></div>}
            {laundry.status === "draft" ? <p className="text-sm text-[var(--muted)]">{t.errors.not_submitted}</p> : (
              <ActionForm action={reviewLaundryAction} className="space-y-2">
                <input type="hidden" name="id" value={laundry.id} />
                <Select name="status" defaultValue="approved">
                  <option value="approved">{a.approve}</option>
                  <option value="info_required">{a.requestInfo}</option>
                  <option value="under_review">{a.markUnderReview}</option>
                  <option value="rejected">{a.reject}</option>
                </Select>
                <Textarea name="notes" placeholder={a.reviewNotes} maxLength={1000} />
                <SubmitButton className="w-full" confirmText={t.common.areYouSure}>{t.common.confirm}</SubmitButton>
              </ActionForm>
            )}
          </Card>
          <Card className="p-4">
            <ActionForm action={setLaundryActiveAction}>
              <input type="hidden" name="id" value={laundry.id} />
              <input type="hidden" name="value" value={String(!laundry.is_active)} />
              <SubmitButton variant={laundry.is_active ? "danger" : "success"} className="w-full" confirmText={t.common.areYouSure}>{laundry.is_active ? a.suspend : a.activate}</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title={a.subscription} action={s ? <Badge tone={subscriptionTone[s.status]}>{t.subscriptionStatus[s.status]}</Badge> : undefined} />
            {!s ? <p className="p-4 text-sm text-[var(--muted)]">{t.partner.subscriptionPage.notReady}</p> : (
              <div className="space-y-3 p-4">
                <KV k={t.partner.subscriptionPage.periodEnd} v={<span className="font-num">{dateOnly(s.current_period_end, locale)}</span>} />
                <ActionForm action={recordSubscriptionPaymentAction} className="space-y-2 rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-semibold">{a.recordPayment}</p>
                  <input type="hidden" name="laundry_id" value={laundry.id} />
                  <Select name="method"><option value="bank_transfer">{t.paymentMethod.bank_transfer}</option><option value="cash">{t.paymentMethod.cash}</option></Select>
                  <Input name="reference" required placeholder={t.common.reference} dir="ltr" />
                  <SubmitButton size="sm" variant="success" confirmText={t.common.areYouSure}>{t.common.confirm}</SubmitButton>
                </ActionForm>
                <ActionForm action={setSubscriptionStatusAction} className="space-y-2">
                  <input type="hidden" name="id" value={s.id} />
                  <Field label={t.common.status}>
                    <Select name="status" defaultValue="suspended">
                      <option value="suspended">{t.subscriptionStatus.suspended}</option>
                      <option value="cancelled">{t.subscriptionStatus.cancelled}</option>
                      <option value="expired">{t.subscriptionStatus.expired}</option>
                      <option value="active">{t.subscriptionStatus.active}</option>
                    </Select>
                  </Field>
                  <Input name="notes" placeholder={t.common.notes} />
                  <SubmitButton size="sm" variant="secondary" confirmText={t.common.areYouSure}>{t.common.apply}</SubmitButton>
                </ActionForm>
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
