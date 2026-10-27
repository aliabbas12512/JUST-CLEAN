"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveLaundryAction } from "@/app/actions/partner";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { FileUpload } from "@/components/ui/file-upload";
import { Button, Card, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { displayPhone } from "@/lib/phone";
import type { Category, City, Laundry } from "@/lib/types";

const DEFAULT_HOURS: Record<string, [string, string] | null> = {
  "0": ["08:00", "23:00"], "1": ["08:00", "23:00"], "2": ["08:00", "23:00"], "3": ["08:00", "23:00"],
  "4": ["08:00", "23:00"], "5": ["16:00", "23:00"], "6": ["08:00", "23:00"],
};

export function LaundryForm({ laundry, cities, categories, selectedCategories, defaultRadius }:
  { laundry: Laundry | null; cities: City[]; categories: Category[]; selectedCategories: number[]; defaultRadius: number }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const f = t.partner.fields;
  const [lat, setLat] = useState<string>(laundry?.lat?.toString() ?? "");
  const [lng, setLng] = useState<string>(laundry?.lng?.toString() ?? "");
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const hours = laundry?.opening_hours && Object.keys(laundry.opening_hours).length ? laundry.opening_hours : DEFAULT_HOURS;
  const canSubmit = !laundry || ["draft", "info_required", "rejected"].includes(laundry.status);

  const locate = () => {
    if (!navigator.geolocation) return setLocMsg(t.home.locationUnsupported);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setLocMsg(null); },
      () => setLocMsg(t.home.locationDenied),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <ActionForm
      action={saveLaundryAction}
      successMessage
      className="space-y-4"
      onSuccess={() => { if (!laundry) router.push("/partner"); }}
    >
      {laundry && <input type="hidden" name="id" value={laundry.id} />}

      <Card>
        <CardHeader title={t.partner.sections.owner} />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label={f.representativeName}><Input name="representative_name" defaultValue={laundry?.representative_name} required minLength={2} maxLength={120} autoComplete="name" /></Field>
          <Field label={f.phone}><Input name="phone" defaultValue={displayPhone(laundry?.phone)} required inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" /></Field>
          <Field label={f.email}><Input name="email" type="email" defaultValue={laundry?.email ?? ""} dir="ltr" /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t.partner.sections.business} />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label={f.businessName}><Input name="name" defaultValue={laundry?.name} required minLength={2} maxLength={120} /></Field>
          <Field label={f.businessNameEn}><Input name="name_en" defaultValue={laundry?.name_en ?? ""} dir="ltr" maxLength={120} /></Field>
          <Field label={f.crNumber}><Input name="cr_number" defaultValue={laundry?.cr_number ?? ""} dir="ltr" inputMode="numeric" maxLength={30} /></Field>
          <Field label={f.vatNumber}><Input name="vat_number" defaultValue={laundry?.vat_number ?? ""} dir="ltr" inputMode="numeric" maxLength={30} /></Field>
          <div className="sm:col-span-2"><Checkbox name="vat_registered" defaultChecked={laundry?.vat_registered} label={f.vatRegistered} /></div>
          <Field label={f.description} className="sm:col-span-2"><Textarea name="description" defaultValue={laundry?.description ?? ""} maxLength={600} /></Field>
          <FileUpload bucket="laundry-logos" name="logo_path" label={f.logo} accept="image/png,image/jpeg,image/webp" maxBytes={2 * 1024 * 1024} existing={laundry?.logo_path} />
        </div>
      </Card>

      <Card>
        <CardHeader title={t.partner.sections.location} />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label={t.common.city}>
            <Select name="city_id" defaultValue={laundry?.city_id} required>
              {cities.map((c) => <option key={c.id} value={c.id}>{locale === "ur" ? c.name_ur : c.name_ar}</option>)}
            </Select>
          </Field>
          <Field label={t.common.district}><Input name="district_text" defaultValue={laundry?.district_text ?? ""} maxLength={120} /></Field>
          <Field label={f.address} className="sm:col-span-2"><Input name="address" defaultValue={laundry?.address} required minLength={5} maxLength={300} /></Field>
          <div className="sm:col-span-2">
            <Button type="button" variant="secondary" icon="locate" onClick={locate}>{f.useLocation}</Button>
            {locMsg && <p className="mt-1 text-sm text-amber-700">{locMsg}</p>}
          </div>
          <Field label={f.lat}><Input name="lat" value={lat} onChange={(e) => setLat(e.target.value)} dir="ltr" inputMode="decimal" required /></Field>
          <Field label={f.lng}><Input name="lng" value={lng} onChange={(e) => setLng(e.target.value)} dir="ltr" inputMode="decimal" required /></Field>
          {lat && lng && (
            <a className="text-sm font-semibold text-brand-700 sm:col-span-2" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}>{t.common.navigate}</a>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.partner.sections.services} />
        <div className="space-y-4 p-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-950">{f.categories}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categories.map((c) => (
                <Checkbox key={c.id} name="categories" value={c.id} defaultChecked={selectedCategories.includes(c.id)} label={locale === "ur" ? c.name_ur : c.name_ar} />
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Checkbox name="supports_pickup" defaultChecked={laundry?.supports_pickup ?? true} label={f.supportsPickup} />
            <Checkbox name="supports_delivery" defaultChecked={laundry?.supports_delivery ?? true} label={f.supportsDelivery} />
            <Checkbox name="supports_dropoff" defaultChecked={laundry?.supports_dropoff ?? true} label={f.supportsDropoff} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={f.pickupFee}><Input name="pickup_fee" type="number" min={0} max={500} step="0.5" defaultValue={laundry?.pickup_fee ?? 0} dir="ltr" /></Field>
            <Field label={f.deliveryFee}><Input name="delivery_fee" type="number" min={0} max={500} step="0.5" defaultValue={laundry?.delivery_fee ?? 0} dir="ltr" /></Field>
            <Field label={f.minOrder}><Input name="min_order" type="number" min={0} max={5000} step="1" defaultValue={laundry?.min_order ?? 0} dir="ltr" /></Field>
            <Field label={f.radius}><Input name="service_radius_km" type="number" min={1} max={50} step="0.5" defaultValue={laundry?.service_radius_km ?? defaultRadius} dir="ltr" /></Field>
            <Field label={f.prepHours}><Input name="prep_hours" type="number" min={1} max={720} defaultValue={laundry?.prep_hours ?? 24} dir="ltr" /></Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t.partner.sections.hours} />
        <div className="divide-y divide-[var(--line)] px-4">
          {t.days.map((d, i) => {
            const h = hours[String(i)];
            return (
              <div key={i} className="flex flex-wrap items-center gap-3 py-2.5">
                <label className="flex w-28 items-center gap-2 font-semibold">
                  <input type="checkbox" name={`h${i}_open`} defaultChecked={!!h} className="size-4.5 accent-brand-700" />{d}
                </label>
                <input type="time" name={`h${i}_from`} defaultValue={h?.[0] ?? "08:00"} className="rounded-lg px-2 py-1.5 ring-1 ring-[var(--line)]" dir="ltr" />
                <span className="text-slate-400">–</span>
                <input type="time" name={`h${i}_to`} defaultValue={h?.[1] ?? "23:00"} className="rounded-lg px-2 py-1.5 ring-1 ring-[var(--line)]" dir="ltr" />
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.partner.sections.documents} />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <FileUpload bucket="partner-docs" name="doc_commercial_registration" label={f.crDoc} />
          <FileUpload bucket="partner-docs" name="doc_municipal_license" label={f.licenseDoc} />
        </div>
      </Card>

      <Card>
        <CardHeader title={t.partner.sections.settlement} />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label={f.bankName}><Input name="settlement_bank_name" defaultValue={laundry?.settlement_bank_name ?? ""} maxLength={80} /></Field>
          <Field label={f.iban}><Input name="settlement_iban" defaultValue={laundry?.settlement_iban ?? ""} dir="ltr" maxLength={34} placeholder="SA0000000000000000000000" /></Field>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <Checkbox name="accept_terms" defaultChecked={!!laundry?.terms_accepted_at} label={<>{f.acceptTerms} <a href="/legal/terms" target="_blank" className="font-semibold text-brand-700">{t.footer.terms}</a></>} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton name="intent" value="save" variant="secondary">{laundry ? t.common.save : t.partner.saveDraft}</SubmitButton>
          {canSubmit && <SubmitButton name="intent" value="submit">{t.partner.submitForReview}</SubmitButton>}
        </div>
      </Card>
    </ActionForm>
  );
}
