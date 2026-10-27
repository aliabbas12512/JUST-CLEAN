"use client";
import { savePackageAction } from "@/app/actions/partner";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import type { Category, Package } from "@/lib/types";

export function PackageForm({ pkg, categories }: { pkg?: Package; categories: Category[] }) {
  const { t, locale } = useI18n();
  const p = t.partner.packagesPage;
  return (
    <ActionForm action={savePackageAction} resetOnSuccess={!pkg} successMessage className="grid gap-3 sm:grid-cols-2">
      {pkg && <input type="hidden" name="id" value={pkg.id} />}
      <Field label={p.nameAr}><Input name="name_ar" defaultValue={pkg?.name_ar} required maxLength={120} /></Field>
      <Field label={p.nameUr}><Input name="name_ur" defaultValue={pkg?.name_ur ?? ""} maxLength={120} /></Field>
      <Field label={p.price}><Input name="price" type="number" min={1} step="0.5" defaultValue={pkg?.price} required dir="ltr" /></Field>
      <Field label={p.pieceCredits}><Input name="piece_credits" type="number" min={1} max={1000} defaultValue={pkg?.piece_credits} required dir="ltr" /></Field>
      <Field label={p.maxOrders}><Input name="max_orders" type="number" min={1} max={100} defaultValue={pkg?.max_orders ?? ""} dir="ltr" /></Field>
      <Field label={p.intervalDays}><Input name="interval_days" type="number" min={7} max={365} defaultValue={pkg?.interval_days ?? 30} required dir="ltr" /></Field>
      <div className="sm:col-span-2"><Checkbox name="free_pickup_delivery" defaultChecked={pkg?.free_pickup_delivery} label={p.freeDelivery} /></div>
      <div className="sm:col-span-2">
        <p className="mb-2 text-sm font-semibold text-brand-950">{p.eligibleCategories}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map((c) => <Checkbox key={c.id} name="eligible_category_ids" value={c.id} defaultChecked={pkg?.eligible_category_ids.includes(c.id)} label={locale === "ur" ? c.name_ur : c.name_ar} />)}
        </div>
      </div>
      <Field label={p.terms} className="sm:col-span-2"><Textarea name="terms" defaultValue={pkg?.terms} required minLength={10} maxLength={2000} rows={4} /></Field>
      <Field label={p.overageNote} className="sm:col-span-2"><Input name="overage_note" defaultValue={pkg?.overage_note ?? ""} maxLength={300} placeholder={t.packages.overage} /></Field>
      <div className="sm:col-span-2"><Checkbox name="is_active" defaultChecked={pkg?.is_active ?? true} label={t.common.active} /></div>
      <div className="sm:col-span-2"><SubmitButton icon={pkg ? "check" : "plus"}>{pkg ? t.common.save : p.add}</SubmitButton></div>
    </ActionForm>
  );
}
