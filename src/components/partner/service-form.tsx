"use client";
import { useState } from "react";
import { saveServiceAction } from "@/app/actions/partner";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Checkbox, Field, Input, Select } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import type { Category, Service } from "@/lib/types";

export function ServiceForm({ service, categories, onDone }: { service?: Service; categories: Category[]; onDone?: () => void }) {
  const { t, locale } = useI18n();
  const s = t.partner.services;
  const [model, setModel] = useState<Service["pricing_model"]>(service?.pricing_model ?? "per_piece");
  return (
    <ActionForm action={saveServiceAction} resetOnSuccess={!service} onSuccess={onDone} className="grid gap-3 sm:grid-cols-2">
      {service && <input type="hidden" name="id" value={service.id} />}
      <Field label={s.nameAr}><Input name="name_ar" defaultValue={service?.name_ar} required maxLength={120} /></Field>
      <Field label={s.nameUr}><Input name="name_ur" defaultValue={service?.name_ur ?? ""} maxLength={120} lang="ur" /></Field>
      <Field label={s.category}>
        <Select name="category_id" defaultValue={service?.category_id} required>
          {categories.map((c) => <option key={c.id} value={c.id}>{locale === "ur" ? c.name_ur : c.name_ar}</option>)}
        </Select>
      </Field>
      <Field label={s.pricingModel}>
        <Select name="pricing_model" value={model} onChange={(e) => setModel(e.target.value as Service["pricing_model"])}>
          {(["per_piece", "per_kg", "bundle", "fixed", "quote"] as const).map((m) => <option key={m} value={m}>{t.pricing[m]}</option>)}
        </Select>
      </Field>
      {model !== "quote" && <Field label={s.price}><Input name="price" type="number" min={0} max={10000} step="0.25" defaultValue={service?.price ?? ""} required dir="ltr" /></Field>}
      <Field label={s.unitLabel}><Input name="unit_label" defaultValue={service?.unit_label ?? ""} maxLength={40} /></Field>
      <Field label={s.turnaround}><Input name="turnaround_hours" type="number" min={1} max={720} defaultValue={service?.turnaround_hours ?? ""} dir="ltr" /></Field>
      <Field label={t.common.notes}><Input name="description" defaultValue={service?.description ?? ""} maxLength={400} /></Field>
      <Field label={s.restrictions} className="sm:col-span-2"><Input name="restrictions" defaultValue={service?.restrictions ?? ""} maxLength={300} /></Field>
      <div className="sm:col-span-2"><Checkbox name="is_active" defaultChecked={service?.is_active ?? true} label={t.common.active} /></div>
      <div className="sm:col-span-2"><SubmitButton icon={service ? "check" : "plus"}>{service ? t.common.save : s.add}</SubmitButton></div>
    </ActionForm>
  );
}
