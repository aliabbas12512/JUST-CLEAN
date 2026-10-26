"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTIVE_LAUNDRY_COOKIE, getActiveLaundry, getSession } from "@/lib/auth";
import { errorKey } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

const fail = (error: string): ActionResult<never> => ({ ok: false, error });

async function authed() {
  const s = await getSession();
  if (!s.supabase || !s.user) return null;
  return { supabase: s.supabase, user: s.user };
}

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : Number(v));
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const bool = (v: FormDataEntryValue | null) => v === "on" || v === "true";


export async function setActiveLaundry(id: string) {
  (await cookies()).set(ACTIVE_LAUNDRY_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  revalidatePath("/partner", "layout");
}

// ---------------------------------------------------------------- registration / profile
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const laundrySchema = z.object({
  representative_name: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  name_en: z.string().max(120).optional(),
  description: z.string().max(600).optional(),
  phone: z.string().regex(/^\+?[0-9]{9,15}$/),
  email: z.string().email().optional(),
  city_id: z.number().int().positive(),
  district_text: z.string().max(120).optional(),
  address: z.string().min(5).max(300),
  lat: z.number().min(16).max(33),
  lng: z.number().min(34).max(56),
  cr_number: z.string().max(30).optional(),
  vat_number: z.string().max(30).optional(),
  vat_registered: z.boolean(),
  supports_pickup: z.boolean(),
  supports_delivery: z.boolean(),
  supports_dropoff: z.boolean(),
  pickup_fee: z.number().min(0).max(500),
  delivery_fee: z.number().min(0).max(500),
  min_order: z.number().min(0).max(5000),
  service_radius_km: z.number().gt(0).max(50),
  prep_hours: z.number().int().min(1).max(720),
  settlement_bank_name: z.string().max(80).optional(),
  settlement_iban: z.string().regex(/^SA[0-9A-Z]{22}$/).optional(),
});

export async function saveLaundryAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const id = str(fd.get("id"));
  const intent = fd.get("intent");

  const phoneRaw = (str(fd.get("phone")) ?? "").replace(/[^0-9]/g, "");
  const phone = /^05\d{8}$/.test(phoneRaw) ? `966${phoneRaw.slice(1)}` : /^5\d{8}$/.test(phoneRaw) ? `966${phoneRaw}` : phoneRaw;
  const parsed = laundrySchema.safeParse({
    representative_name: str(fd.get("representative_name")),
    name: str(fd.get("name")),
    name_en: str(fd.get("name_en")),
    description: str(fd.get("description")),
    phone,
    email: str(fd.get("email")),
    city_id: num(fd.get("city_id")),
    district_text: str(fd.get("district_text")),
    address: str(fd.get("address")),
    lat: num(fd.get("lat")),
    lng: num(fd.get("lng")),
    cr_number: str(fd.get("cr_number")),
    vat_number: str(fd.get("vat_number")),
    vat_registered: bool(fd.get("vat_registered")),
    supports_pickup: bool(fd.get("supports_pickup")),
    supports_delivery: bool(fd.get("supports_delivery")),
    supports_dropoff: bool(fd.get("supports_dropoff")),
    pickup_fee: num(fd.get("pickup_fee")) ?? 0,
    delivery_fee: num(fd.get("delivery_fee")) ?? 0,
    min_order: num(fd.get("min_order")) ?? 0,
    service_radius_km: num(fd.get("service_radius_km")) ?? 5,
    prep_hours: num(fd.get("prep_hours")) ?? 24,
    settlement_bank_name: str(fd.get("settlement_bank_name")),
    settlement_iban: str(fd.get("settlement_iban"))?.replace(/\s/g, "").toUpperCase(),
  });
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return fail(field === "lat" || field === "lng" ? "location_required" : "validation");
  }

  const hours: Record<string, [string, string] | null> = {};
  for (let d = 0; d < 7; d++) {
    const open = bool(fd.get(`h${d}_open`));
    const from = String(fd.get(`h${d}_from`) ?? "");
    const to = String(fd.get(`h${d}_to`) ?? "");
    hours[String(d)] = open && hm.safeParse(from).success && hm.safeParse(to).success ? [from, to] : null;
  }

  const acceptTerms = bool(fd.get("accept_terms"));
  const row = { ...parsed.data, opening_hours: hours, ...(acceptTerms ? { terms_accepted_at: new Date().toISOString() } : {}) };

  let laundryId = id;
  if (laundryId) {
    const { error } = await s.supabase.from("laundries").update(row).eq("id", laundryId).eq("owner_id", s.user.id);
    if (error) return fail(errorKey(error));
  } else {
    const { data, error } = await s.supabase.from("laundries").insert({ ...row, owner_id: s.user.id }).select("id").single();
    if (error) return fail(errorKey(error));
    laundryId = data.id as string;
    (await cookies()).set(ACTIVE_LAUNDRY_COOKIE, laundryId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  }

  // Categories
  const cats = fd.getAll("categories").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  await s.supabase.from("laundry_categories").delete().eq("laundry_id", laundryId);
  if (cats.length) await s.supabase.from("laundry_categories").insert(cats.map((c) => ({ laundry_id: laundryId, category_id: c })));

  // Files were uploaded from the browser into the user's own storage folder; only accept those paths.
  const own = (p: string | undefined) => (p && p.startsWith(`${s.user.id}/`) && !p.includes("..") ? p : undefined);
  const logoPath = own(str(fd.get("logo_path")));
  if (logoPath) await s.supabase.from("laundries").update({ logo_path: logoPath }).eq("id", laundryId);
  for (const kind of ["commercial_registration", "municipal_license"] as const) {
    const path = own(str(fd.get(`doc_${kind}`)));
    if (path) await s.supabase.from("laundry_documents").insert({ laundry_id: laundryId, kind, storage_path: path, file_name: path.split("/").pop() });
  }

  if (intent === "submit") {
    const { error } = await s.supabase.rpc("submit_laundry", { p_laundry: laundryId });
    if (error) return fail(errorKey(error));
  }
  revalidatePath("/partner", "layout");
  return { ok: true, data: { id: laundryId! } };
}

export async function toggleAcceptingAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const { error } = await s.supabase.from("laundries").update({ accepting_orders: fd.get("value") === "true" })
    .eq("id", String(fd.get("laundry_id"))).eq("owner_id", s.user.id);
  if (error) return fail(errorKey(error));
  revalidatePath("/partner", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- orders
async function rpc(fn: string, args: Record<string, unknown>, path?: string): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const { error } = await s.supabase.rpc(fn, args);
  if (error) return fail(errorKey(error));
  if (path) revalidatePath(path);
  return { ok: true };
}

export async function respondOrderAction(_: unknown, fd: FormData) {
  const id = String(fd.get("order_id"));
  const accept = fd.get("decision") === "accept";
  const reason = str(fd.get("reason"));
  if (!accept && !reason) return fail("reason_required");
  return rpc("partner_respond_order", { p_order: id, p_accept: accept, p_reason: reason ?? null }, `/partner/orders/${id}`);
}

export async function advanceOrderAction(_: unknown, fd: FormData) {
  const id = String(fd.get("order_id"));
  return rpc("partner_advance_order", { p_order: id, p_to: String(fd.get("to")), p_code: str(fd.get("code")) ?? null }, `/partner/orders/${id}`);
}

export async function requestRiderAction(_: unknown, fd: FormData) {
  const id = String(fd.get("order_id"));
  return rpc("partner_request_rider", { p_order: id }, `/partner/orders/${id}`);
}

export async function adjustPriceAction(_: unknown, fd: FormData) {
  const id = String(fd.get("order_id"));
  const amount = num(fd.get("amount"));
  if (amount === undefined || !(amount >= 0)) return fail("invalid_amount");
  return rpc("partner_adjust_price", { p_order: id, p_final_total: amount, p_note: str(fd.get("note")) ?? "" }, `/partner/orders/${id}`);
}

export async function markPaidAction(_: unknown, fd: FormData) {
  const id = String(fd.get("order_id"));
  const method = fd.get("method") === "bank_transfer" ? "bank_transfer" : "cash";
  return rpc("partner_mark_order_paid", { p_order: id, p_method: method, p_reference: str(fd.get("reference")) ?? null }, `/partner/orders/${id}`);
}

// ---------------------------------------------------------------- services
const serviceSchema = z.object({
  category_id: z.number().int().positive(),
  name_ar: z.string().min(1).max(120),
  name_ur: z.string().max(120).optional(),
  description: z.string().max(400).optional(),
  pricing_model: z.enum(["per_piece", "per_kg", "bundle", "fixed", "quote"]),
  price: z.number().min(0).max(10000).optional(),
  unit_label: z.string().max(40).optional(),
  turnaround_hours: z.number().int().min(1).max(720).optional(),
  restrictions: z.string().max(300).optional(),
  is_active: z.boolean(),
});

export async function saveServiceAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const laundry = await getActiveLaundry();
  if (!laundry) return fail("forbidden");
  const parsed = serviceSchema.safeParse({
    category_id: num(fd.get("category_id")),
    name_ar: str(fd.get("name_ar")),
    name_ur: str(fd.get("name_ur")),
    description: str(fd.get("description")),
    pricing_model: fd.get("pricing_model"),
    price: num(fd.get("price")),
    unit_label: str(fd.get("unit_label")),
    turnaround_hours: num(fd.get("turnaround_hours")),
    restrictions: str(fd.get("restrictions")),
    is_active: fd.get("is_active") !== null ? bool(fd.get("is_active")) : true,
  });
  if (!parsed.success) return fail("validation");
  const v = parsed.data;
  if (v.pricing_model !== "quote" && v.price === undefined) return fail("validation");
  const row = { ...v, price: v.pricing_model === "quote" ? null : v.price, laundry_id: laundry.id };
  const id = str(fd.get("id"));
  const res = id
    ? await s.supabase.from("services").update(row).eq("id", id).eq("laundry_id", laundry.id)
    : await s.supabase.from("services").insert(row);
  if (res.error) return fail(errorKey(res.error));
  revalidatePath("/partner/services");
  return { ok: true };
}

export async function toggleServiceAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const { error } = await s.supabase.from("services").update({ is_active: fd.get("value") === "true" }).eq("id", String(fd.get("id")));
  if (error) return fail(errorKey(error));
  revalidatePath("/partner/services");
  return { ok: true };
}

export async function deleteServiceAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  // Order items keep a name snapshot, so deleting a service never breaks order history.
  const { error } = await s.supabase.from("services").delete().eq("id", String(fd.get("id")));
  if (error) return fail(errorKey(error));
  revalidatePath("/partner/services");
  return { ok: true };
}

// ---------------------------------------------------------------- packages
const packageSchema = z.object({
  name_ar: z.string().min(2).max(120),
  name_ur: z.string().max(120).optional(),
  description: z.string().max(400).optional(),
  price: z.number().positive().max(10000),
  piece_credits: z.number().int().positive().max(1000),
  max_orders: z.number().int().positive().max(100).optional(),
  interval_days: z.number().int().min(7).max(365),
  free_pickup_delivery: z.boolean(),
  eligible_category_ids: z.array(z.number().int().positive()),
  overage_note: z.string().max(300).optional(),
  terms: z.string().min(10).max(2000),
  is_active: z.boolean(),
});

export async function savePackageAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const laundry = await getActiveLaundry();
  if (!laundry) return fail("forbidden");
  const parsed = packageSchema.safeParse({
    name_ar: str(fd.get("name_ar")),
    name_ur: str(fd.get("name_ur")),
    description: str(fd.get("description")),
    price: num(fd.get("price")),
    piece_credits: num(fd.get("piece_credits")),
    max_orders: num(fd.get("max_orders")),
    interval_days: num(fd.get("interval_days")) ?? 30,
    free_pickup_delivery: bool(fd.get("free_pickup_delivery")),
    eligible_category_ids: fd.getAll("eligible_category_ids").map(Number).filter(Boolean),
    overage_note: str(fd.get("overage_note")),
    terms: str(fd.get("terms")),
    is_active: fd.get("is_active") !== null ? bool(fd.get("is_active")) : true,
  });
  if (!parsed.success) return fail("validation");
  const id = str(fd.get("id"));
  const row = { ...parsed.data, laundry_id: laundry.id };
  const res = id
    ? await s.supabase.from("packages").update(row).eq("id", id).eq("laundry_id", laundry.id)
    : await s.supabase.from("packages").insert(row);
  if (res.error) return fail(errorKey(res.error));
  revalidatePath("/partner/packages");
  return { ok: true };
}

export async function confirmPackagePaymentAction(_: unknown, fd: FormData) {
  return rpc("partner_confirm_package_payment", { p_payment: String(fd.get("payment_id")), p_reference: str(fd.get("reference")) ?? null }, "/partner/packages");
}

// ---------------------------------------------------------------- subscription
export async function submitSubscriptionPaymentAction(_: unknown, fd: FormData) {
  const laundry = await getActiveLaundry();
  if (!laundry) return fail("forbidden");
  return rpc("partner_submit_subscription_payment", { p_laundry: laundry.id, p_method: "bank_transfer", p_reference: str(fd.get("reference")) ?? "" }, "/partner/subscription");
}

// ---------------------------------------------------------------- reviews
export async function replyReviewAction(_: unknown, fd: FormData) {
  return rpc("partner_reply_review", { p_review: String(fd.get("review_id")), p_reply: str(fd.get("reply")) ?? "" }, "/partner/reviews");
}
