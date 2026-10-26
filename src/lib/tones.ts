import type { LaundryStatus, RiderStatus, SubscriptionStatus } from "@/lib/types";

type Tone = "gray" | "amber" | "green" | "red" | "blue";

export const laundryStatusTone: Record<LaundryStatus, Tone> = {
  draft: "gray", submitted: "amber", under_review: "blue", approved: "green", rejected: "red", info_required: "amber",
};
export const subscriptionTone: Record<SubscriptionStatus, Tone> = {
  active: "green", pending: "amber", past_due: "amber", expired: "red", suspended: "red", cancelled: "gray",
};
export const riderTone: Record<RiderStatus, Tone> = { pending: "amber", active: "green", suspended: "red", rejected: "gray" };
