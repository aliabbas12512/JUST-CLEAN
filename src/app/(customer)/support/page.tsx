import Link from "next/link";
import { createTicketAction } from "@/app/actions/customer";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Badge, Card, CardHeader, Checkbox, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { dateTime, telUrl, waUrl } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { t, locale } = await getI18n();
  const { supabase, user } = await requireUser("/support");
  const order = (await searchParams).order ?? "";
  const [{ data: tickets }, { data: settings }] = await Promise.all([
    supabase.from("support_tickets").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("platform_settings").select("support_phone, support_whatsapp").maybeSingle(),
  ]);
  const list = (tickets as { id: string; subject: string; status: keyof typeof t.support.statuses; is_dispute: boolean; updated_at: string }[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={t.support.title} />
      <Card>
        <CardHeader title={t.support.newTicket} />
        <ActionForm action={createTicketAction} resetOnSuccess successMessage className="space-y-3 p-4">
          <Field label={t.support.subject}><Input name="subject" required minLength={3} maxLength={200} /></Field>
          <Field label={t.support.relatedOrder}><Input name="order_number" defaultValue={order} dir="ltr" maxLength={30} /></Field>
          <Field label={t.support.message}><Textarea name="body" required maxLength={4000} rows={4} /></Field>
          <Checkbox name="is_dispute" label={t.support.isDispute} defaultChecked={!!order} />
          <SubmitButton>{t.common.submit}</SubmitButton>
        </ActionForm>
      </Card>
      {(settings?.support_phone || settings?.support_whatsapp) && (
        <Card className="flex flex-wrap items-center gap-4 p-4 text-sm">
          <span className="text-[var(--muted)]">{t.support.contactDirect}:</span>
          {settings.support_phone && <a href={telUrl(settings.support_phone)!} className="font-num font-semibold text-brand-700" dir="ltr">{settings.support_phone}</a>}
          {settings.support_whatsapp && <a href={waUrl(settings.support_whatsapp)!} target="_blank" rel="noopener" className="font-semibold text-emerald-700">{t.common.whatsapp}</a>}
        </Card>
      )}
      {list.length === 0 ? <EmptyState icon="support" title={t.support.noTickets} /> : (
        <ul className="space-y-2">
          {list.map((tk) => (
            <li key={tk.id}>
              <Link href={`/support/${tk.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-[var(--line)] hover:bg-slate-50">
                <div>
                  <p className="font-semibold text-brand-950">{tk.subject}</p>
                  <p className="font-num text-xs text-[var(--muted)]">{dateTime(tk.updated_at, locale)}</p>
                </div>
                <Badge tone={tk.status === "resolved" || tk.status === "closed" ? "green" : "amber"}>{t.support.statuses[tk.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
