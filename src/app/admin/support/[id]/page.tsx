import Link from "next/link";
import { staffReplyAction } from "@/app/actions/admin";
import { TicketThread, type TicketMessage } from "@/components/ticket-thread";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Card, EmptyState, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = await getI18n();
  const { id } = await params;
  const { supabase, user } = await requireAdmin();
  const { data: tk } = await supabase.from("support_tickets").select("*, orders(id, order_number), profiles(full_name, phone)").eq("id", id).maybeSingle();
  if (!tk) return <EmptyState title={t.errors.not_found} />;
  const { data: messages } = await supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader back="/admin/support" title={tk.subject} subtitle={<>{tk.profiles?.full_name} <span dir="ltr" className="font-num">{tk.profiles?.phone}</span>{tk.orders && <> · <Link href={`/admin/orders/${tk.orders.id}`} className="font-num text-brand-700" dir="ltr">{tk.orders.order_number}</Link></>}</>} />
      <TicketThread messages={(messages as TicketMessage[]) ?? []} meId={user.id} t={t} locale={locale} staffView />
      <Card className="p-4">
        <ActionForm action={staffReplyAction} resetOnSuccess className="space-y-3">
          <input type="hidden" name="ticket_id" value={id} />
          <Textarea name="body" maxLength={4000} placeholder={t.support.message} />
          <div className="flex gap-2">
            <Select name="status" defaultValue={tk.status === "open" ? "in_progress" : tk.status} className="w-auto">
              {Object.entries(t.support.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <SubmitButton>{t.support.reply}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
