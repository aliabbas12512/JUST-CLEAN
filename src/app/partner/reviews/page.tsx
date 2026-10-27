import { replyReviewAction } from "@/app/actions/partner";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Card, EmptyState, PageHeader, Stars, Textarea } from "@/components/ui/primitives";
import { requireLaundry } from "@/lib/auth";
import { dateOnly } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Review } from "@/lib/types";

export default async function PartnerReviewsPage() {
  const { t, locale } = await getI18n();
  const { supabase, laundry } = await requireLaundry();
  const { data } = await supabase.from("reviews").select("*").eq("laundry_id", laundry.id).order("created_at", { ascending: false }).limit(100);
  const list = (data as Review[]) ?? [];
  const r = t.partner.reviewsPage;
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <PageHeader title={r.title} subtitle={laundry.rating_count > 0 ? <Stars value={laundry.rating_avg} count={laundry.rating_count} /> : undefined} />
      {list.length === 0 ? <EmptyState icon="star" title={r.empty} /> : list.map((rv) => (
        <Card key={rv.id} className="p-4">
          <div className="flex items-center justify-between"><Stars value={rv.rating} /><span className="font-num text-xs text-[var(--muted)]">{dateOnly(rv.created_at, locale)}</span></div>
          {rv.comment && <p className="mt-2 text-sm text-slate-700">{rv.comment}</p>}
          <ActionForm action={replyReviewAction} className="mt-3 space-y-2" successMessage>
            <input type="hidden" name="review_id" value={rv.id} />
            <Textarea name="reply" defaultValue={rv.partner_reply ?? ""} placeholder={r.yourReply} maxLength={1000} rows={2} />
            <SubmitButton variant="secondary" size="sm">{r.reply}</SubmitButton>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
