"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { errorKey } from "@/lib/errors";
import type { ActionResult, Fulfillment } from "@/lib/types";

async function authed() {
  const s = await getSession();
  if (!s.supabase || !s.user) return null;
  return { supabase: s.supabase, user: s.user };
}

const fail = (error: string): ActionResult<never> => ({ ok: false, error });

export async function toggleFavorite(laundryId: string, makeFavorite: boolean): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const res = makeFavorite
    ? await s.supabase.from("favorites").upsert({ user_id: s.user.id, laundry_id: laundryId })
    : await s.supabase.from("favorites").delete().eq("user_id", s.user.id).eq("laundry_id", laundryId);
  if (res.error) return fail(errorKey(res.error));
  return { ok: true };
}

// ---------------------------------------------------------------- checkout
const itemSchema = z.object({
  service_id: z.string().uuid(),
  quantity: z.number().positive().max(500),
  instructions: z.string().max(300).optional(),
});
const fulfillmentSchema = z.enum(["pickup_delivery", "pickup_only", "delivery_only", "dropoff"]);

export type Quote = {
  items: { service_id: string; name: string; name_ur: string | null; pricing_model: string; unit_price: number | null; quantity: number; line_total: number; covered_by_package: number }[];
  subtotal: number; package_credit: number; package_pieces: number; pickup_fee: number; delivery_fee: number;
  discount: number; vat_included: number; total: number; is_estimate: boolean; min_order: number; errors: string[];
};

export async function quoteOrder(input: { laundryId: string; fulfillment: Fulfillment; items: z.infer<typeof itemSchema>[]; promo?: string; customerPackageId?: string | null }): Promise<ActionResult<Quote>> {
  const s = await getSession();
  if (!s.supabase) return fail("generic");
  const items = z.array(itemSchema).max(50).safeParse(input.items);
  if (!items.success || !fulfillmentSchema.safeParse(input.fulfillment).success) return fail("validation");
  const { data, error } = await s.supabase.rpc("quote_order", {
    p_laundry_id: input.laundryId,
    p_fulfillment: input.fulfillment,
    p_items: items.data,
    p_promo_code: input.promo?.trim() || null,
    p_customer_package_id: input.customerPackageId || null,
  });
  if (error) return fail(errorKey(error));
  return { ok: true, data: data as Quote };
}

const placeSchema = z.object({
  clientToken: z.string().uuid(),
  laundryId: z.string().uuid(),
  fulfillment: fulfillmentSchema,
  items: z.array(itemSchema).min(1).max(50),
  contact: z.object({ name: z.string().trim().min(2).max(120), phone: z.string().regex(/^\+?[0-9]{9,15}$/) }),
  address: z.object({
    city_id: z.number().int().optional(),
    district_text: z.string().max(120).optional(),
    line: z.string().max(500).optional(),
    lat: z.number().min(16).max(33).optional(),
    lng: z.number().min(34).max(56).optional(),
    notes: z.string().max(500).optional(),
  }),
  saveAddress: z.boolean().optional(),
  windowStart: z.string().datetime({ offset: true }).nullable().optional(),
  windowEnd: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(1000).optional(),
  promo: z.string().max(20).optional(),
  customerPackageId: z.string().uuid().nullable().optional(),
});

export async function placeOrder(input: z.infer<typeof placeSchema>): Promise<ActionResult<{ id: string; order_number: string }>> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path[0];
    return fail(path === "contact" ? "contact_invalid" : path === "address" ? "address_required" : "validation");
  }
  const v = parsed.data;
  const { data, error } = await s.supabase.rpc("place_order", {
    p_client_token: v.clientToken,
    p_laundry_id: v.laundryId,
    p_fulfillment: v.fulfillment,
    p_items: v.items,
    p_contact: v.contact,
    p_address: v.address,
    p_window_start: v.windowStart ?? null,
    p_window_end: v.windowEnd ?? null,
    p_notes: v.notes || null,
    p_promo_code: v.promo?.trim() || null,
    p_customer_package_id: v.customerPackageId || null,
    p_payment_method: "cash",
  });
  if (error) return fail(errorKey(error));
  if (v.saveAddress && v.address.line && v.address.city_id) {
    await s.supabase.from("addresses").insert({
      user_id: s.user.id, label: "home", city_id: v.address.city_id, district_text: v.address.district_text ?? null,
      line: v.address.line, lat: v.address.lat ?? null, lng: v.address.lng ?? null, notes: v.address.notes ?? null,
    });
  }
  // Keep the profile name filled for next time.
  await s.supabase.from("profiles").update({ full_name: v.contact.name }).eq("id", s.user.id).is("full_name", null);
  const res = data as { id: string; order_number: string };
  return { ok: true, data: res };
}

// ---------------------------------------------------------------- order actions
async function rpcAction(fn: string, args: Record<string, unknown>, revalidate?: string): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const { error } = await s.supabase.rpc(fn, args);
  if (error) return fail(errorKey(error));
  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}

export async function cancelOrderAction(_: unknown, fd: FormData) {
  const id = String(fd.get("order_id"));
  return rpcAction("cancel_order", { p_order: id, p_reason: String(fd.get("reason") ?? "") || null }, `/orders/${id}`);
}

export async function respondAdjustmentAction(_: unknown, fd: FormData) {
  const id = String(fd.get("order_id"));
  return rpcAction("respond_price_adjustment", { p_order: id, p_approve: fd.get("decision") === "approve" }, `/orders/${id}`);
}

export async function confirmReceivedAction(_: unknown, fd: FormData) {
  const id = String(fd.get("order_id"));
  return rpcAction("confirm_order_received", { p_order: id }, `/orders/${id}`);
}

export async function submitReviewAction(_: unknown, fd: FormData) {
  const id = String(fd.get("order_id"));
  const rating = Number(fd.get("rating"));
  if (!(rating >= 1 && rating <= 5)) return fail("invalid_rating");
  return rpcAction("submit_review", { p_order: id, p_rating: rating, p_comment: String(fd.get("comment") ?? "") || null }, `/orders/${id}`);
}

// ---------------------------------------------------------------- packages
export async function purchasePackageAction(_: unknown, fd: FormData) {
  return rpcAction("purchase_package", { p_package: String(fd.get("package_id")), p_method: "cash" }, "/account/packages");
}

export async function cancelPackageAction(_: unknown, fd: FormData) {
  return rpcAction("cancel_customer_package", { p_id: String(fd.get("id")) }, "/account/packages");
}

// ---------------------------------------------------------------- profile
const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  notify_sms: z.boolean(),
  notify_push: z.boolean(),
  notify_marketing: z.boolean(),
});

export async function updateProfileAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const parsed = profileSchema.safeParse({
    full_name: fd.get("full_name"),
    notify_sms: fd.get("notify_sms") === "on",
    notify_push: fd.get("notify_push") === "on",
    notify_marketing: fd.get("notify_marketing") === "on",
  });
  if (!parsed.success) return fail("validation");
  const { error } = await s.supabase.from("profiles").update(parsed.data).eq("id", s.user.id);
  if (error) return fail(errorKey(error));
  return { ok: true };
}

export async function requestDeletionAction(): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const { error } = await s.supabase.from("profiles").update({ deletion_requested_at: new Date().toISOString() }).eq("id", s.user.id);
  if (error) return fail(errorKey(error));
  await s.supabase.from("support_tickets").insert({ user_id: s.user.id, subject: "Account deletion request" });
  return { ok: true };
}

const addressSchema = z.object({
  label: z.enum(["home", "work", "other"]),
  city_id: z.coerce.number().int().positive(),
  district_text: z.string().trim().max(120).optional(),
  line: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(500).optional(),
  lat: z.coerce.number().min(16).max(33).optional(),
  lng: z.coerce.number().min(34).max(56).optional(),
});

export async function saveAddressAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const raw = Object.fromEntries(fd.entries());
  const parsed = addressSchema.safeParse({ ...raw, lat: raw.lat || undefined, lng: raw.lng || undefined, district_text: raw.district_text || undefined, notes: raw.notes || undefined });
  if (!parsed.success) return fail("address_required");
  const { error } = await s.supabase.from("addresses").insert({ ...parsed.data, user_id: s.user.id });
  if (error) return fail(errorKey(error));
  revalidatePath("/account/addresses");
  return { ok: true };
}

export async function deleteAddressAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const { error } = await s.supabase.from("addresses").delete().eq("id", String(fd.get("id"))).eq("user_id", s.user.id);
  if (error) return fail(errorKey(error));
  revalidatePath("/account/addresses");
  return { ok: true };
}

export async function markNotificationsReadAction(): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  await s.supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).eq("user_id", s.user.id);
  revalidatePath("/notifications");
  return { ok: true };
}

// ---------------------------------------------------------------- support
export async function createTicketAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const subject = String(fd.get("subject") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const orderNumber = String(fd.get("order_number") ?? "").trim();
  if (subject.length < 3 || body.length < 1) return fail("validation");
  let orderId: string | null = null;
  if (orderNumber) {
    const { data } = await s.supabase.from("orders").select("id").eq("order_number", orderNumber.toUpperCase()).maybeSingle();
    orderId = data?.id ?? null;
  }
  const { data, error } = await s.supabase.from("support_tickets")
    .insert({ user_id: s.user.id, subject: subject.slice(0, 200), order_id: orderId, is_dispute: fd.get("is_dispute") === "on" })
    .select("id").single();
  if (error) return fail(errorKey(error));
  await s.supabase.from("ticket_messages").insert({ ticket_id: data.id, author_id: s.user.id, body: body.slice(0, 4000) });
  revalidatePath("/support");
  return { ok: true, data: { id: data.id } };
}

export async function replyTicketAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return fail("validation");
  const ticketId = String(fd.get("ticket_id"));
  const { error } = await s.supabase.from("ticket_messages").insert({ ticket_id: ticketId, author_id: s.user.id, body: body.slice(0, 4000) });
  if (error) return fail(errorKey(error));
  revalidatePath(`/support/${ticketId}`);
  return { ok: true };
}
