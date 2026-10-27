import { confirmPackagePaymentAction } from "@/app/actions/partner";
import { PackageForm } from "@/components/partner/package-form";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Badge, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { requireLaundry } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import type { Category, Package, Payment } from "@/lib/types";

export default async function PartnerPackagesPage() {
  const { t, locale } = await getI18n();
  const { supabase, laundry } = await requireLaundry();
  const [{ data: packages }, { data: categories }, { data: pending }, { count: activeSubs }] = await Promise.all([
    supabase.from("packages").select("*").eq("laundry_id", laundry.id).order("created_at"),
    supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("payments").select("*, customer_packages(id, packages(name_ar))").eq("laundry_id", laundry.id).eq("kind", "customer_package").eq("status", "pending").order("created_at"),
    supabase.from("customer_packages").select("id", { count: "exact", head: true }).eq("laundry_id", laundry.id).eq("status", "active"),
  ]);
  const p = t.partner.packagesPage;
  const cats = (categories as Category[]) ?? [];
  const pend = (pending as (Payment & { customer_packages: { packages: { name_ar: string } | null } | null })[]) ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title={p.title} subtitle={`${p.subscribers}: ${activeSubs ?? 0}`} />
      {pend.length > 0 && (
        <Card>
          <CardHeader title={p.pendingPayments} />
          <ul className="divide-y divide-[var(--line)] px-4">
            {pend.map((pay) => (
              <li key={pay.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{pay.customer_packages?.packages?.name_ar}</p>
                  <p className="font-num text-sm text-[var(--muted)]">{money(pay.amount, locale)} · {dateTime(pay.created_at, locale)}</p>
                </div>
                <ActionForm action={confirmPackagePaymentAction} className="flex gap-2">
                  <input type="hidden" name="payment_id" value={pay.id} />
                  <Input name="reference" placeholder={t.common.reference} className="w-36" dir="ltr" />
                  <SubmitButton variant="success" size="sm" confirmText={t.common.areYouSure}>{p.confirmPayment}</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title={p.add} />
        <div className="p-4"><PackageForm categories={cats} /></div>
      </Card>
      {((packages as Package[]) ?? []).length === 0 ? <EmptyState icon="box" title={p.empty} /> : ((packages as Package[]) ?? []).map((pkg) => (
        <details key={pkg.id} className="rounded-2xl bg-white ring-1 ring-[var(--line)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <div>
              <p className="font-bold text-brand-950">{pkg.name_ar}</p>
              <p className="text-sm text-[var(--muted)]"><span className="font-num">{money(pkg.price, locale)}</span> · {fmt(t.packages.pieces, { n: pkg.piece_credits })} · {fmt(t.packages.validity, { n: pkg.interval_days })}</p>
            </div>
            {!pkg.is_active && <Badge>{t.common.inactive}</Badge>}
          </summary>
          <div className="border-t border-[var(--line)] p-4"><PackageForm pkg={pkg} categories={cats} /></div>
        </details>
      ))}
    </div>
  );
}
