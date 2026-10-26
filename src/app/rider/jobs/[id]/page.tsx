import { confirmDeliveryAction, confirmPickupAction, failJobAction, releaseJobAction } from "@/app/actions/rider";
import { JobCard } from "@/components/rider/job-card";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Icon } from "@/components/ui/icon";
import { Alert, Card, EmptyState, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { mapsUrl, telUrl, waUrl } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { displayPhone } from "@/lib/phone";
import type { DeliveryJob } from "@/lib/types";

export default async function RiderJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = await getI18n();
  const { id } = await params;
  const { supabase, user } = await requireUser(`/rider/jobs/${id}`);
  const { data: j } = await supabase.from("delivery_jobs").select("*").eq("id", id).eq("rider_id", user.id).maybeSingle();
  const job = j as DeliveryJob | null;
  if (!job) return <EmptyState title={t.errors.not_found} />;
  const live = job.status === "assigned" || job.status === "picked_up";
  // Order contact details are only readable while the job is live (RLS).
  const { data: o } = live
    ? await supabase.from("orders").select("contact_name, contact_phone, address_notes, notes, laundries(name, phone)").eq("id", job.order_id).maybeSingle()
    : { data: null };
  const order = o as unknown as { contact_name: string; contact_phone: string; address_notes: string | null; notes: string | null; laundries: { name: string; phone: string } | null } | null;
  const r = t.rider;
  const fromUrl = mapsUrl(job.from_lat, job.from_lng, job.from_label);
  const toUrl = mapsUrl(job.to_lat, job.to_lng, job.to_label);

  const CodeForm = ({ action, label, button }: { action: typeof confirmPickupAction; label: string; button: string }) => (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="job_id" value={job.id} />
      <Field label={label}>
        <Input name="code" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" dir="ltr" className="h-16 text-center text-3xl font-bold tracking-[0.5em]" />
      </Field>
      <SubmitButton variant="success" size="lg" className="w-full" icon="check">{button}</SubmitButton>
    </ActionForm>
  );

  return (
    <div className="space-y-4">
      <PageHeader back="/rider" title={<span className="font-num" dir="ltr">{job.order_number}</span>} subtitle={r.legs[job.leg]} />
      <JobCard j={job} t={t} locale={locale} />

      <Card className="divide-y divide-[var(--line)]">
        <div className="space-y-2 p-4">
          <p className="text-sm text-[var(--muted)]">{r.pickupFrom}</p>
          <p className="font-semibold text-brand-950">{job.from_label}</p>
          {fromUrl && <LinkButton href={fromUrl} target="_blank" rel="noopener" variant="secondary" size="sm" icon="nav">{t.common.navigate}</LinkButton>}
        </div>
        <div className="space-y-2 p-4">
          <p className="text-sm text-[var(--muted)]">{r.deliverTo}</p>
          <p className="font-semibold text-brand-950">{job.to_label}</p>
          {toUrl && <LinkButton href={toUrl} target="_blank" rel="noopener" variant="secondary" size="sm" icon="nav">{t.common.navigate}</LinkButton>}
        </div>
        {order && (
          <div className="space-y-2 p-4">
            <p className="text-sm text-[var(--muted)]">{r.customer}</p>
            <p className="font-semibold text-brand-950">{order.contact_name}</p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href={telUrl(order.contact_phone) ?? "#"} variant="secondary" size="sm" icon="phone"><span className="font-num" dir="ltr">{displayPhone(order.contact_phone)}</span></LinkButton>
              <LinkButton href={waUrl(order.contact_phone) ?? "#"} target="_blank" rel="noopener" variant="secondary" size="sm">{t.common.whatsapp}</LinkButton>
              {order.laundries?.phone && <LinkButton href={telUrl(order.laundries.phone) ?? "#"} variant="ghost" size="sm" icon="store">{order.laundries.name}</LinkButton>}
            </div>
            {order.address_notes && <p className="text-sm text-amber-800">{order.address_notes}</p>}
          </div>
        )}
      </Card>

      {job.leg === "pickup" && job.status === "assigned" && <Card className="p-4"><CodeForm action={confirmPickupAction} label={r.enterPickupCode} button={r.confirmPickup} /></Card>}
      {job.leg === "pickup" && job.status === "picked_up" && <Alert tone="blue" icon="store">{r.deliverToLaundry}</Alert>}
      {job.leg === "return" && job.status === "assigned" && <Alert tone="blue" icon="store">{r.awaitHandover}</Alert>}
      {job.leg === "return" && job.status === "picked_up" && <Card className="p-4"><CodeForm action={confirmDeliveryAction} label={r.enterDeliveryCode} button={r.confirmDelivery} /></Card>}
      {!live && <Alert tone={job.status === "delivered" ? "green" : "amber"}>{r.jobStatus[job.status]}{job.fail_reason && ` — ${job.fail_reason}`}</Alert>}

      {live && (
        <div className="grid gap-2 sm:grid-cols-2">
          {job.status === "assigned" && (
            <ActionForm action={releaseJobAction} redirectTo="/rider">
              <input type="hidden" name="job_id" value={job.id} />
              <SubmitButton variant="secondary" className="w-full" confirmText={t.common.areYouSure}>{r.release}</SubmitButton>
            </ActionForm>
          )}
          {!(job.leg === "pickup" && job.status === "picked_up") && (
            <details className="rounded-2xl bg-white p-3 ring-1 ring-[var(--line)]">
              <summary className="flex cursor-pointer items-center gap-2 font-semibold text-red-700"><Icon name="alert" className="size-4.5" />{r.fail}</summary>
              <ActionForm action={failJobAction} className="mt-3 space-y-2">
                <input type="hidden" name="job_id" value={job.id} />
                <Select name="reason" required>
                  {Object.entries(r.failReasons).map(([k, v]) => <option key={k} value={v}>{v}</option>)}
                </Select>
                <Input name="detail" maxLength={200} placeholder={t.common.notes} />
                <SubmitButton variant="danger" className="w-full" confirmText={t.common.areYouSure}>{r.fail}</SubmitButton>
              </ActionForm>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
