import { deleteAddressAction, saveAddressAction } from "@/app/actions/customer";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Card, CardHeader, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import type { City } from "@/lib/types";

export default async function AddressesPage() {
  const { t, locale } = await getI18n();
  const { supabase, user } = await requireUser("/account/addresses");
  const [{ data: addresses }, { data: cities }] = await Promise.all([
    supabase.from("addresses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("cities").select("*").eq("is_active", true).order("sort_order"),
  ]);
  const cityList = (cities as City[]) ?? [];
  const cityName = (id: number) => { const c = cityList.find((x) => x.id === id); return c ? (locale === "ur" ? c.name_ur : c.name_ar) : ""; };
  const list = (addresses as { id: string; label: string; city_id: number; district_text: string | null; line: string; notes: string | null }[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={t.account.addresses} back="/account" />
      {list.length === 0 ? <EmptyState icon="pin" title={t.account.noAddresses} /> : (
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-[var(--line)]">
              <div>
                <p className="font-bold text-brand-950">{(t.account.labels as Record<string, string>)[a.label] ?? a.label}</p>
                <p className="text-sm text-slate-600">{[cityName(a.city_id), a.district_text, a.line].filter(Boolean).join(" · ")}</p>
                {a.notes && <p className="text-xs text-[var(--muted)]">{a.notes}</p>}
              </div>
              <ActionForm action={deleteAddressAction}>
                <input type="hidden" name="id" value={a.id} />
                <SubmitButton variant="ghost" size="sm" icon="trash" confirmText={t.common.areYouSure}>{t.common.delete}</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <CardHeader title={t.checkout.newAddress} />
        <ActionForm action={saveAddressAction} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label={t.account.addressLabel}>
            <Select name="label" defaultValue="home">
              {Object.entries(t.account.labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label={t.common.city}>
            <Select name="city_id" required>{cityList.map((c) => <option key={c.id} value={c.id}>{locale === "ur" ? c.name_ur : c.name_ar}</option>)}</Select>
          </Field>
          <Field label={t.common.district}><Input name="district_text" maxLength={120} /></Field>
          <Field label={t.checkout.addressLine}><Input name="line" required minLength={3} maxLength={500} /></Field>
          <Field label={t.checkout.addressNotes} className="sm:col-span-2"><Input name="notes" maxLength={500} /></Field>
          <div className="sm:col-span-2"><SubmitButton icon="plus">{t.common.add}</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  );
}
