"use client";
import { registerRiderAction } from "@/app/actions/rider";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { FileUpload } from "@/components/ui/file-upload";
import { Field, Input, Select } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import type { City } from "@/lib/types";

export function RiderJoinForm({ cities, defaults }: { cities: City[]; defaults: { name: string; phone: string } }) {
  const { t, locale } = useI18n();
  const r = t.rider;
  return (
    <ActionForm action={registerRiderAction} className="grid gap-3 sm:grid-cols-2">
      <Field label={r.fullName}><Input name="full_name" defaultValue={defaults.name} required minLength={2} maxLength={120} /></Field>
      <Field label={t.common.phone}><Input name="phone" defaultValue={defaults.phone} required inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" /></Field>
      <Field label={t.common.city}>
        <Select name="city_id" required>{cities.map((c) => <option key={c.id} value={c.id}>{locale === "ur" ? c.name_ur : c.name_ar}</option>)}</Select>
      </Field>
      <Field label={r.vehicle}>
        <Select name="vehicle_type" defaultValue="motorcycle">
          {(["motorcycle", "car", "van", "bicycle"] as const).map((v) => <option key={v} value={v}>{r.vehicles[v]}</option>)}
        </Select>
      </Field>
      <Field label={r.plate}><Input name="vehicle_plate" maxLength={20} dir="ltr" /></Field>
      <Field label={r.nationalId}><Input name="national_id" inputMode="numeric" maxLength={10} pattern="[12][0-9]{9}" dir="ltr" /></Field>
      <FileUpload bucket="rider-docs" name="id_document_path" label={r.idDoc} />
      <FileUpload bucket="rider-docs" name="license_document_path" label={r.licenseDoc} />
      <div className="sm:col-span-2"><SubmitButton size="lg">{r.apply}</SubmitButton></div>
    </ActionForm>
  );
}
