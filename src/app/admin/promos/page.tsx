import { savePromoAction, togglePromoAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { dateOnly, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

type Promo = { id: string; code: string; discount_type: "percent" | "fixed"; discount_value: number; max_discount: number | null; min_order: number;
  usage_limit: number | null; per_user_limit: number; used_count: number; starts_at: string | null; ends_at: string | null; is_active: boolean };

export default async function AdminPromos() {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
  const list = (data as Promo[]) ?? [];
  const p = t.admin.promos;
  return (
    <div className="space-y-4">
      <PageHeader title={t.admin.nav.promos} />
      <Card>
        <CardHeader title={t.common.add} />
        <ActionForm action={savePromoAction} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-4">
          <Field label={p.code}><Input name="code" required pattern="[A-Za-z0-9_-]{3,20}" dir="ltr" /></Field>
          <Field label={p.type}><Select name="discount_type"><option value="percent">{p.percent}</option><option value="fixed">{p.fixed}</option></Select></Field>
          <Field label={p.value}><Input name="discount_value" type="number" step="0.01" min={0.01} required dir="ltr" /></Field>
          <Field label={p.maxDiscount}><Input name="max_discount" type="number" step="0.01" min={0} dir="ltr" /></Field>
          <Field label={p.minOrder}><Input name="min_order" type="number" step="0.01" min={0} defaultValue={0} dir="ltr" /></Field>
          <Field label={p.usageLimit}><Input name="usage_limit" type="number" min={1} dir="ltr" /></Field>
          <Field label={p.perUser}><Input name="per_user_limit" type="number" min={1} defaultValue={1} dir="ltr" /></Field>
          <Field label={t.common.notes}><Input name="description" maxLength={200} /></Field>
          <Field label={p.startsAt}><Input name="starts_at" type="date" dir="ltr" /></Field>
          <Field label={p.endsAt}><Input name="ends_at" type="date" dir="ltr" /></Field>
          <div className="flex items-end sm:col-span-2"><SubmitButton icon="plus">{t.common.add}</SubmitButton></div>
        </ActionForm>
      </Card>
      <Table head={[p.code, p.value, p.minOrder, p.used, p.endsAt, t.common.status]}>
        {list.map((pr) => (
          <tr key={pr.id}>
            <Td className="font-num font-bold" >{pr.code}</Td>
            <Td className="font-num">{pr.discount_type === "percent" ? `${pr.discount_value}%` : money(pr.discount_value, locale)}{pr.max_discount ? ` ≤ ${money(pr.max_discount, locale)}` : ""}</Td>
            <Td className="font-num">{money(pr.min_order, locale)}</Td>
            <Td className="font-num">{pr.used_count}{pr.usage_limit ? ` / ${pr.usage_limit}` : ""}</Td>
            <Td className="font-num">{pr.ends_at ? dateOnly(pr.ends_at, locale) : "—"}</Td>
            <Td>
              <ActionForm action={togglePromoAction}>
                <input type="hidden" name="id" value={pr.id} /><input type="hidden" name="value" value={String(!pr.is_active)} />
                <button><Badge tone={pr.is_active ? "green" : "gray"}>{pr.is_active ? t.common.active : t.common.inactive}</Badge></button>
              </ActionForm>
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
