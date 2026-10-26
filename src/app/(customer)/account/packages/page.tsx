import { cancelPackageAction } from "@/app/actions/customer";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { dateOnly, money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/shared";
import type { CustomerPackage } from "@/lib/types";

export default async function MyPackagesPage() {
  const { t, locale } = await getI18n();
  const { supabase, user } = await requireUser("/account/packages");
  const { data } = await supabase.from("customer_packages")
    .select("*, packages(name_ar, name_ur, terms), laundries(name)")
    .eq("customer_id", user.id).order("created_at", { ascending: false });
  const list = (data as (CustomerPackage & { packages: { name_ar: string; name_ur: string | null; terms: string } | null; laundries: { name: string } | null })[]) ?? [];
  const tone = { pending_payment: "amber", active: "green", exhausted: "gray", expired: "gray", cancelled: "red" } as const;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <PageHeader title={t.packages.myPackages} back="/account" actions={<LinkButton href="/packages" variant="secondary" size="sm">{t.packages.title}</LinkButton>} />
      {list.length === 0 ? <EmptyState icon="box" title={t.packages.noPackages} /> : list.map((cp) => (
        <Card key={cp.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-brand-950">{locale === "ur" && cp.packages?.name_ur ? cp.packages.name_ur : cp.packages?.name_ar}</p>
              <p className="text-sm text-[var(--muted)]">{cp.laundries?.name} · <span className="font-num">{money(cp.price_paid, locale)}</span></p>
            </div>
            <Badge tone={tone[cp.status]}>{t.packages.statusLabels[cp.status]}</Badge>
          </div>
          {cp.status === "pending_payment" && <div className="mt-3"><Alert tone="amber">{t.packages.pendingPaymentBody}</Alert></div>}
          {(cp.status === "active" || cp.status === "exhausted") && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (cp.pieces_used / cp.piece_credits) * 100)}%` }} />
              </div>
              <p className="font-num mt-1 text-sm text-slate-600">{fmt(t.packages.used, { used: cp.pieces_used, total: cp.piece_credits })}</p>
              {cp.period_end && <p className="text-xs text-[var(--muted)]">{fmt(t.packages.expires, { date: dateOnly(cp.period_end, locale) })}</p>}
            </div>
          )}
          {["pending_payment", "active", "exhausted"].includes(cp.status) && (
            <ActionForm action={cancelPackageAction} className="mt-3">
              <input type="hidden" name="id" value={cp.id} />
              <p className="mb-2 text-xs text-[var(--muted)]">{t.packages.cancelNote}</p>
              <SubmitButton variant="ghost" size="sm" confirmText={t.common.areYouSure}>{t.packages.cancel}</SubmitButton>
            </ActionForm>
          )}
        </Card>
      ))}
    </div>
  );
}
