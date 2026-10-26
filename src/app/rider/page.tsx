import { claimJobAction } from "@/app/actions/rider";
import { LiveRefresh } from "@/components/live-refresh";
import { JobCard, type JobLite } from "@/components/rider/job-card";
import { RiderJoinForm } from "@/components/rider/join-form";
import { OnlineToggle } from "@/components/rider/online-toggle";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getMyRider, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { displayPhone } from "@/lib/phone";
import type { City, DeliveryJob } from "@/lib/types";

export default async function RiderHome() {
  const { t, locale } = await getI18n();
  const { supabase, user, profile } = await requireUser("/rider");
  const rider = await getMyRider();

  if (!rider || rider.status === "rejected") {
    const { data: cities } = await supabase.from("cities").select("*").eq("is_active", true).order("sort_order");
    return (
      <div className="space-y-4">
        <PageHeader title={t.rider.joinTitle} subtitle={t.rider.joinSubtitle} />
        {rider?.status === "rejected" && <Alert tone="red" title={t.rider.statusLabels.rejected}>{rider.review_notes}</Alert>}
        <Card className="p-4">
          <RiderJoinForm cities={(cities as City[]) ?? []} defaults={{ name: rider?.full_name ?? profile?.full_name ?? "", phone: displayPhone(rider?.phone ?? profile?.phone) }} />
        </Card>
      </div>
    );
  }
  if (rider.status !== "active") {
    return (
      <div className="space-y-4">
        <PageHeader title={t.rider.title} />
        <Alert tone="amber" title={t.rider.statusLabels[rider.status]}>{rider.status === "pending" ? t.rider.pendingBody : rider.review_notes}</Alert>
      </div>
    );
  }

  const [{ data: mine }, open] = await Promise.all([
    supabase.from("delivery_jobs").select("*").eq("rider_id", user.id).in("status", ["assigned", "picked_up"]).order("assigned_at"),
    rider.is_online ? supabase.rpc("rider_open_jobs") : Promise.resolve({ data: [] }),
  ]);
  const myJobs = (mine as DeliveryJob[]) ?? [];
  const openJobs = (open.data as JobLite[]) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title={rider.full_name} subtitle={t.rider.title} actions={<LiveRefresh channel={`rider-${user.id}`} subscriptions={[{ table: "delivery_jobs" }]} />} />
      <OnlineToggle online={rider.is_online} />
      <section>
        <h2 className="mb-2 font-bold text-brand-950">{t.rider.myJobs}</h2>
        {myJobs.length === 0 ? <p className="rounded-2xl bg-white p-4 text-sm text-[var(--muted)] ring-1 ring-[var(--line)]">{t.rider.noActiveJobs}</p> : (
          <div className="space-y-2">{myJobs.map((j) => <JobCard key={j.id} j={j} t={t} locale={locale} href={`/rider/jobs/${j.id}`} />)}</div>
        )}
      </section>
      {rider.is_online && (
        <section>
          <h2 className="mb-2 font-bold text-brand-950">{t.rider.availableJobs}</h2>
          {openJobs.length === 0 ? <EmptyState icon="bike" title={t.rider.noJobs} /> : (
            <div className="space-y-2">
              {openJobs.map((j) => (
                <JobCard key={j.id} j={j} t={t} locale={locale}>
                  <ActionForm action={claimJobAction} redirectTo={`/rider/jobs/${j.id}`}>
                    <input type="hidden" name="job_id" value={j.id} />
                    <SubmitButton size="lg" className="w-full">{t.rider.accept}</SubmitButton>
                  </ActionForm>
                </JobCard>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
