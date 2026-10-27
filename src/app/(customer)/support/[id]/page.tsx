import { replyTicketAction } from "@/app/actions/customer";
import { TicketThread, type TicketMessage } from "@/components/ticket-thread";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Badge, Card, EmptyState, PageHeader, Textarea } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = await getI18n();
  const { id } = await params;
  const { supabase, user } = await requireUser(`/support/${id}`);
  const { data: ticket } = await supabase.from("support_tickets").select("*").eq("id", id).maybeSingle();
  if (!ticket) return <EmptyState title={t.errors.not_found} />;
  const { data: messages } = await supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader back="/support" title={ticket.subject} actions={<Badge tone="amber">{t.support.statuses[ticket.status as keyof typeof t.support.statuses]}</Badge>} />
      <TicketThread messages={(messages as TicketMessage[]) ?? []} meId={user.id} t={t} locale={locale} />
      {ticket.status !== "closed" && (
        <Card className="p-4">
          <ActionForm action={replyTicketAction} resetOnSuccess className="space-y-3">
            <input type="hidden" name="ticket_id" value={id} />
            <Textarea name="body" required maxLength={4000} placeholder={t.support.message} />
            <SubmitButton>{t.support.reply}</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
