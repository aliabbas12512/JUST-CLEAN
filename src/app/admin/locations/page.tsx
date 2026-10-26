import { deleteDistrictAction, saveCityAction, saveDistrictAction, toggleCityAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import type { City, District } from "@/lib/types";

export default async function AdminLocations() {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const [{ data: cities }, { data: districts }] = await Promise.all([
    supabase.from("cities").select("*").order("sort_order"),
    supabase.from("districts").select("*").eq("is_active", true).order("name_ar"),
  ]);
  const cityList = (cities as City[]) ?? [];
  const dList = (districts as District[]) ?? [];
  const l = t.admin.locations;
  return (
    <div className="space-y-4">
      <PageHeader title={t.admin.nav.locations} />
      <Card>
        <CardHeader title={l.addCity} />
        <ActionForm action={saveCityAction} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-5">
          <Field label={l.slug}><Input name="slug" required pattern="[a-z0-9-]{2,40}" dir="ltr" /></Field>
          <Field label={l.nameAr}><Input name="name_ar" required /></Field>
          <Field label={l.nameUr}><Input name="name_ur" required /></Field>
          <Field label={t.partner.fields.lat}><Input name="lat" type="number" step="0.0001" required dir="ltr" /></Field>
          <Field label={t.partner.fields.lng}><Input name="lng" type="number" step="0.0001" required dir="ltr" /></Field>
          <div className="sm:col-span-5"><SubmitButton icon="plus">{t.common.add}</SubmitButton></div>
        </ActionForm>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {cityList.map((c) => (
          <Card key={c.id}>
            <CardHeader title={locale === "ur" ? c.name_ur : c.name_ar} subtitle={<span dir="ltr">{c.slug}</span>}
              action={
                <ActionForm action={toggleCityAction}>
                  <input type="hidden" name="id" value={c.id} /><input type="hidden" name="value" value={String(!c.is_active)} />
                  <SubmitButton size="sm" variant={c.is_active ? "secondary" : "success"}>{c.is_active ? t.common.active : t.common.inactive}</SubmitButton>
                </ActionForm>
              } />
            <div className="flex flex-wrap gap-1.5 p-4">
              {dList.filter((d) => d.city_id === c.id).map((d) => (
                <ActionForm key={d.id} action={deleteDistrictAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="inline-flex items-center gap-1"><Badge tone="blue">{locale === "ur" ? d.name_ur : d.name_ar} ×</Badge></button>
                </ActionForm>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title={l.addDistrict} />
        <ActionForm action={saveDistrictAction} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-4">
          <Field label={t.common.city}><Select name="city_id">{cityList.map((c) => <option key={c.id} value={c.id}>{locale === "ur" ? c.name_ur : c.name_ar}</option>)}</Select></Field>
          <Field label={l.nameAr}><Input name="name_ar" required /></Field>
          <Field label={l.nameUr}><Input name="name_ur" required /></Field>
          <div className="flex items-end"><SubmitButton icon="plus">{t.common.add}</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  );
}
