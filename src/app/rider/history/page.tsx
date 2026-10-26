import { JobCard } from "@/components/rider/job-card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { DeliveryJob } from "@/lib/types";

export default async function RiderHistoryPage() {
  const { t, locale } = await getI18n();
  const { supabase, user } = await requireUser("/rider/history");
  const { data } = await supabase.from("delivery_jobs").select("*").eq("rider_id", user.id)
    .in("status", ["delivered", "failed", "cancelled"]).order("updated_at", { ascending: false }).limit(200);
  const jobs = (data as DeliveryJob[]) ?? [];
  const earned = jobs.filter((j) => j.status === "delivered").reduce((a, j) => a + Number(j.rider_fee), 0);
  return (
    <div className="space-y-4">
      <PageHeader title={t.rider.history} />
      <div className="grid grid-cols-2 gap-3">
        <Stat label={t.rider.jobStatus.delivered} value={jobs.filter((j) => j.status === "delivered").length} icon="check" />
        <Stat label={t.rider.earnings} value={money(earned, locale)} icon="wallet" />
      </div>
      {jobs.length === 0 ? <EmptyState icon="bike" title={t.rider.noActiveJobs} /> : (
        <div className="space-y-2">{jobs.map((j) => <JobCard key={j.id} j={j} t={t} locale={locale} href={`/rider/jobs/${j.id}`} />)}</div>
      )}
    </div>
  );
}
