import { dateTime } from "@/lib/format";
import type { Dict, Locale } from "@/lib/i18n/shared";

export type TicketMessage = { id: number; author_id: string; is_staff: boolean; body: string; created_at: string };

export function TicketThread({ messages, meId, t, locale, staffView = false }:
  { messages: TicketMessage[]; meId: string; t: Dict; locale: Locale; staffView?: boolean }) {
  return (
    <ul className="space-y-3">
      {messages.map((m) => {
        const mine = staffView ? m.is_staff : m.author_id === meId;
        return (
          <li key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "bg-brand-900 text-white" : "bg-white ring-1 ring-[var(--line)]"}`}>
              <p className="mb-0.5 text-xs font-semibold opacity-75">{m.is_staff ? t.support.staff : staffView ? t.partner.customer : t.support.you}</p>
              <p className="whitespace-pre-line">{m.body}</p>
              <p className="font-num mt-1 text-[11px] opacity-60">{dateTime(m.created_at, locale)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
