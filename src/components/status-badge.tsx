import { Badge } from "@/components/ui/primitives";
import type { Dict } from "@/lib/i18n/shared";
import type { OrderStatus } from "@/lib/types";

const tone: Record<OrderStatus, "gray" | "blue" | "green" | "amber" | "red" | "violet"> = {
  placed: "amber", accepted: "blue", rejected: "red", pickup_assigned: "blue", picked_up: "violet", received: "violet",
  processing: "violet", ready: "green", return_assigned: "blue", out_for_delivery: "blue", delivered: "green",
  completed: "green", cancelled: "red",
};

export function OrderStatusBadge({ status, t }: { status: OrderStatus; t: Dict }) {
  return <Badge tone={tone[status]}>{t.status[status]}</Badge>;
}
