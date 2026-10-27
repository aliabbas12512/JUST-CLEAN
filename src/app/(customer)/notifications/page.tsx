import Link from "next/link";
import { markNotificationsReadAction } from "@/app/actions/customer";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { notificationText } from "@/lib/notifications";
import type { Notification } from "@/lib/types";

export default async function NotificationsPage() {
  const { t, locale } = await getI18n();
  const { supabase, user } = await requireUser("/notifications");
  const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  const list = (data as Notification[]) ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.notifications.title} actions={list.some((n) => !n.read_at) ? (
        <ActionForm action={async () => { "use server"; return markNotificationsReadAction(); }}>
          <SubmitButton variant="secondary" size="sm" icon="check">{t.notifications.markAllRead}</SubmitButton>
        </ActionForm>
      ) : undefined} />
      {list.length === 0 ? <EmptyState icon="bell" title={t.notifications.empty} /> : (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--line)]">
          {list.map((n) => {
            const body = (
              <div className={`flex gap-3 p-4 ${n.read_at ? "" : "bg-brand-50/50"}`}>
                {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-600" />}
                <div>
                  <p className="text-sm font-semibold text-brand-950">{notificationText(n, t)}</p>
                  <p className="font-num text-xs text-[var(--muted)]">{dateTime(n.created_at, locale)}</p>
                </div>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link}>{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
