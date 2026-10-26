import { setReviewHiddenAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Badge, Card, EmptyState, PageHeader, Stars } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Review } from "@/lib/types";

export default async function AdminReviews() {
  const { t, locale } = await getI18n();
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("reviews").select("*, laundries(name)").order("created_at", { ascending: false }).limit(200);
  const list = (data as (Review & { laundries: { name: string } | null })[]) ?? [];
  return (
    <div className="space-y-3">
      <PageHeader title={t.admin.nav.reviews} />
      {list.length === 0 ? <EmptyState icon="star" title={t.common.none} /> : list.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Stars value={r.rating} /><span className="font-semibold">{r.laundries?.name}</span>{r.is_hidden && <Badge tone="red">{t.admin.hidden}</Badge>}</div>
            <span className="font-num text-xs text-[var(--muted)]">{dateTime(r.created_at, locale)}</span>
          </div>
          {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
          {r.partner_reply && <p className="mt-1 text-sm text-[var(--muted)]">↳ {r.partner_reply}</p>}
          <ActionForm action={setReviewHiddenAction} className="mt-2">
            <input type="hidden" name="id" value={r.id} /><input type="hidden" name="value" value={String(!r.is_hidden)} />
            <SubmitButton size="sm" variant="secondary">{r.is_hidden ? t.admin.unhide : t.admin.hide}</SubmitButton>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
