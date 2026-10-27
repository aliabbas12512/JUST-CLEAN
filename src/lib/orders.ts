import type { Fulfillment, OrderStatus } from "@/lib/types";

export function stepsFor(f: Fulfillment): OrderStatus[] {
  switch (f) {
    case "pickup_delivery":
      return ["placed", "accepted", "pickup_assigned", "picked_up", "received", "processing", "ready", "return_assigned", "out_for_delivery", "delivered", "completed"];
    case "pickup_only":
      return ["placed", "accepted", "pickup_assigned", "picked_up", "received", "processing", "ready", "completed"];
    case "delivery_only":
      return ["placed", "accepted", "received", "processing", "ready", "return_assigned", "out_for_delivery", "delivered", "completed"];
    case "dropoff":
      return ["placed", "accepted", "received", "processing", "ready", "completed"];
  }
}

export const ACTIVE_STATUSES: OrderStatus[] = ["placed", "accepted", "pickup_assigned", "picked_up", "received", "processing", "ready", "return_assigned", "out_for_delivery", "delivered"];
export const CLOSED_STATUSES: OrderStatus[] = ["completed", "cancelled", "rejected"];

export const needsPickup = (f: Fulfillment) => f === "pickup_delivery" || f === "pickup_only";
export const needsReturn = (f: Fulfillment) => f === "pickup_delivery" || f === "delivery_only";

export function amountDue(o: { total: number; final_total: number | null; adjustment_status: string | null }) {
  return o.adjustment_status === "approved" && o.final_total != null ? Number(o.final_total) : Number(o.total);
}
