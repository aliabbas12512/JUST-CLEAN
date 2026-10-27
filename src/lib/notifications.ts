import { fmt, type Dict } from "@/lib/i18n/shared";
import type { Notification, OrderStatus } from "@/lib/types";

export function notificationText(n: Notification, t: Dict): string {
  const tpl = (t.notifications.kinds as Record<string, string>)[n.kind];
  if (!tpl) return n.kind;
  const d = n.data as Record<string, string | number | null>;
  const params: Record<string, string | number | null> = { ...d };
  if (typeof d.status === "string") params.status = t.status[d.status as OrderStatus] ?? d.status;
  return fmt(tpl, params);
}
