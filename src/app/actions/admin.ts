"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { errorKey } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const fail = (error: string): ActionResult<never> => ({ ok: false, error });
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

async function admin() {
  const s = await getSession();
  if (!s.supabase || !s.user) return null;
  if (!s.profile?.is_admin) return null;
  return { supabase: s.supabase, user: s.user };
}

async function rpc(fn: string, args: Record<string, unknown>, path?: string): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const { error } = await s.supabase.rpc(fn, args);
  if (error) return fail(errorKey(error));
  if (path) revalidatePath(path, "layout");
  return { ok: true };
}

// Laundries
export async function reviewLaundryAction(_: unknown, fd: FormData) {
  return rpc("admin_review_laundry", { p_laundry: String(fd.get("id")), p_status: String(fd.get("status")), p_notes: str(fd.get("notes")) ?? null }, "/admin/laundries");
}
export async function setLaundryActiveAction(_: unknown, fd: FormData) {
  return rpc("admin_set_laundry_active", { p_laundry: String(fd.get("id")), p_active: fd.get("value") === "true" }, "/admin/laundries");
}

// Riders
export async function reviewRiderAction(_: unknown, fd: FormData) {
  return rpc("admin_review_rider", { p_rider: String(fd.get("id")), p_status: String(fd.get("status")), p_notes: str(fd.get("notes")) ?? null }, "/admin/riders");
}

// Payments & subscriptions
export async function confirmPaymentAction(_: unknown, fd: FormData) {
  return rpc("admin_confirm_payment", { p_payment: String(fd.get("id")), p_reference: str(fd.get("reference")) ?? null }, "/admin");
}
export async function rejectPaymentAction(_: unknown, fd: FormData) {
  const notes = str(fd.get("notes"));
  if (!notes) return fail("note_required");
  return rpc("admin_reject_payment", { p_payment: String(fd.get("id")), p_notes: notes }, "/admin");
}
export async function recordSubscriptionPaymentAction(_: unknown, fd: FormData) {
  return rpc("admin_record_subscription_payment", {
    p_laundry: String(fd.get("laundry_id")),
    p_method: fd.get("method") === "cash" ? "cash" : "bank_transfer",
    p_reference: str(fd.get("reference")) ?? "",
  }, "/admin");
}
export async function setSubscriptionStatusAction(_: unknown, fd: FormData) {
  return rpc("admin_set_subscription_status", { p_sub: String(fd.get("id")), p_status: String(fd.get("status")), p_notes: str(fd.get("notes")) ?? null }, "/admin");
}

// Orders
export async function assignJobAction(_: unknown, fd: FormData) {
  return rpc("admin_assign_job", { p_job: String(fd.get("job_id")), p_rider: String(fd.get("rider_id")) }, "/admin/orders");
}
export async function openJobAction(_: unknown, fd: FormData) {
  return rpc("admin_open_job", { p_order: String(fd.get("order_id")) }, "/admin/orders");
}
export async function adminCancelOrderAction(_: unknown, fd: FormData) {
  return rpc("admin_cancel_order", { p_order: String(fd.get("order_id")), p_reason: str(fd.get("reason")) ?? "" }, "/admin/orders");
}
export async function createRefundAction(_: unknown, fd: FormData) {
  const amount = Number(fd.get("amount"));
  if (!(amount > 0)) return fail("invalid_amount");
  const reason = str(fd.get("reason"));
  if (!reason) return fail("reason_required");
  return rpc("admin_create_refund", { p_order: String(fd.get("order_id")), p_amount: amount, p_reason: reason }, "/admin/orders");
}
export async function processRefundAction(_: unknown, fd: FormData) {
  return rpc("admin_process_refund", { p_refund: String(fd.get("id")), p_status: fd.get("status") === "processed" ? "processed" : "rejected" }, "/admin/orders");
}

// Settings
const settingsSchema = z.object({
  partner_subscription_price: z.number().min(0).max(100000),
  billing_cycle_months: z.number().int().min(1).max(12),
  trial_days: z.number().int().min(0).max(365),
  grace_days: z.number().int().min(0).max(60),
  require_active_subscription: z.boolean(),
  commission_enabled: z.boolean(),
  commission_percent: z.number().min(0).max(100),
  order_accept_timeout_minutes: z.number().int().min(1).max(1440),
  default_service_radius_km: z.number().gt(0).max(50),
  max_search_radius_km: z.number().gt(0).max(100),
  rider_fee_per_leg: z.number().min(0).max(1000),
  max_active_jobs_per_rider: z.number().int().min(1).max(20),
  auto_complete_hours: z.number().int().min(1).max(720),
  vat_rate: z.number().min(0).max(100),
  order_prefix: z.string().regex(/^[A-Z]{1,5}$/),
  support_phone: z.string().max(20).nullable(),
  support_whatsapp: z.string().max(20).nullable(),
  bank_transfer_instructions: z.string().max(2000).nullable(),
});

export async function saveSettingsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const n = (k: string) => Number(fd.get(k));
  const parsed = settingsSchema.safeParse({
    partner_subscription_price: n("partner_subscription_price"),
    billing_cycle_months: n("billing_cycle_months"),
    trial_days: n("trial_days"),
    grace_days: n("grace_days"),
    require_active_subscription: fd.get("require_active_subscription") === "on",
    commission_enabled: fd.get("commission_enabled") === "on",
    commission_percent: n("commission_percent"),
    order_accept_timeout_minutes: n("order_accept_timeout_minutes"),
    default_service_radius_km: n("default_service_radius_km"),
    max_search_radius_km: n("max_search_radius_km"),
    rider_fee_per_leg: n("rider_fee_per_leg"),
    max_active_jobs_per_rider: n("max_active_jobs_per_rider"),
    auto_complete_hours: n("auto_complete_hours"),
    vat_rate: n("vat_rate"),
    order_prefix: String(fd.get("order_prefix") ?? "").toUpperCase(),
    support_phone: str(fd.get("support_phone")) ?? null,
    support_whatsapp: str(fd.get("support_whatsapp")) ?? null,
    bank_transfer_instructions: str(fd.get("bank_transfer_instructions")) ?? null,
  });
  if (!parsed.success) return fail("validation");
  const { error } = await s.supabase.from("platform_settings").update(parsed.data).eq("id", 1);
  if (error) return fail(errorKey(error));
  revalidatePath("/", "layout");
  return { ok: true };
}

// Locations
export async function saveCityAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const parsed = z.object({
    slug: z.string().regex(/^[a-z0-9-]{2,40}$/), name_ar: z.string().min(2).max(60), name_ur: z.string().min(2).max(60),
    lat: z.number().min(16).max(33), lng: z.number().min(34).max(56),
  }).safeParse({ slug: str(fd.get("slug")), name_ar: str(fd.get("name_ar")), name_ur: str(fd.get("name_ur")), lat: Number(fd.get("lat")), lng: Number(fd.get("lng")) });
  if (!parsed.success) return fail("validation");
  const { error } = await s.supabase.from("cities").insert(parsed.data);
  if (error) return fail(errorKey(error));
  revalidatePath("/admin/locations");
  return { ok: true };
}
export async function toggleCityAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const { error } = await s.supabase.from("cities").update({ is_active: fd.get("value") === "true" }).eq("id", Number(fd.get("id")));
  if (error) return fail(errorKey(error));
  revalidatePath("/admin/locations");
  return { ok: true };
}
export async function saveDistrictAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const parsed = z.object({ city_id: z.number().int().positive(), name_ar: z.string().min(2).max(80), name_ur: z.string().min(2).max(80) })
    .safeParse({ city_id: Number(fd.get("city_id")), name_ar: str(fd.get("name_ar")), name_ur: str(fd.get("name_ur")) });
  if (!parsed.success) return fail("validation");
  const { error } = await s.supabase.from("districts").insert(parsed.data);
  if (error) return fail(errorKey(error));
  revalidatePath("/admin/locations");
  return { ok: true };
}
export async function deleteDistrictAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const { error } = await s.supabase.from("districts").update({ is_active: false }).eq("id", Number(fd.get("id")));
  if (error) return fail(errorKey(error));
  revalidatePath("/admin/locations");
  return { ok: true };
}

// Reviews
export async function setReviewHiddenAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const { error } = await s.supabase.from("reviews").update({ is_hidden: fd.get("value") === "true" }).eq("id", String(fd.get("id")));
  if (error) return fail(errorKey(error));
  revalidatePath("/admin/reviews");
  return { ok: true };
}

// Promo codes
export async function savePromoAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const opt = (k: string) => (str(fd.get(k)) ? Number(fd.get(k)) : null);
  const date = (k: string) => (str(fd.get(k)) ? `${fd.get(k)}T00:00:00+03:00` : null);
  const parsed = z.object({
    code: z.string().regex(/^[A-Z0-9_-]{3,20}$/),
    description: z.string().max(200).nullable(),
    discount_type: z.enum(["percent", "fixed"]),
    discount_value: z.number().positive(),
    max_discount: z.number().positive().nullable(),
    min_order: z.number().min(0),
    usage_limit: z.number().int().positive().nullable(),
    per_user_limit: z.number().int().positive(),
    starts_at: z.string().nullable(),
    ends_at: z.string().nullable(),
  }).safeParse({
    code: String(fd.get("code") ?? "").trim().toUpperCase(),
    description: str(fd.get("description")) ?? null,
    discount_type: fd.get("discount_type"),
    discount_value: Number(fd.get("discount_value")),
    max_discount: opt("max_discount"),
    min_order: Number(fd.get("min_order") || 0),
    usage_limit: opt("usage_limit"),
    per_user_limit: Number(fd.get("per_user_limit") || 1),
    starts_at: date("starts_at"),
    ends_at: date("ends_at"),
  });
  if (!parsed.success) return fail("validation");
  if (parsed.data.discount_type === "percent" && parsed.data.discount_value > 100) return fail("validation");
  const { error } = await s.supabase.from("promo_codes").insert(parsed.data);
  if (error) return fail(errorKey(error));
  revalidatePath("/admin/promos");
  return { ok: true };
}
export async function togglePromoAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const { error } = await s.supabase.from("promo_codes").update({ is_active: fd.get("value") === "true" }).eq("id", String(fd.get("id")));
  if (error) return fail(errorKey(error));
  revalidatePath("/admin/promos");
  return { ok: true };
}

// Support
export async function staffReplyAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await admin();
  if (!s) return fail("forbidden");
  const ticketId = String(fd.get("ticket_id"));
  const body = str(fd.get("body"));
  const status = String(fd.get("status") ?? "in_progress");
  if (body) {
    const { error } = await s.supabase.from("ticket_messages").insert({ ticket_id: ticketId, author_id: s.user.id, is_staff: true, body: body.slice(0, 4000) });
    if (error) return fail(errorKey(error));
    const { data: tk } = await s.supabase.from("support_tickets").select("user_id, subject").eq("id", ticketId).maybeSingle();
    if (tk) await s.supabase.from("notifications").insert({ user_id: tk.user_id, kind: "support_reply", data: { subject: tk.subject }, link: `/support/${ticketId}` });
  }
  if (["open", "in_progress", "resolved", "closed"].includes(status)) {
    await s.supabase.from("support_tickets").update({ status }).eq("id", ticketId);
  }
  revalidatePath(`/admin/support/${ticketId}`);
  return { ok: true };
}
