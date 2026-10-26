"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { errorKey } from "@/lib/errors";
import { normalizeSaudiPhone } from "@/lib/phone";
import type { ActionResult } from "@/lib/types";

const fail = (error: string): ActionResult<never> => ({ ok: false, error });

async function authed() {
  const s = await getSession();
  if (!s.supabase || !s.user) return null;
  return { supabase: s.supabase, user: s.user };
}

const riderSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string(),
  city_id: z.number().int().positive(),
  vehicle_type: z.enum(["car", "motorcycle", "bicycle", "van"]),
  vehicle_plate: z.string().max(20).optional(),
  national_id: z.string().regex(/^[12]\d{9}$/).optional(),
});

export async function registerRiderAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const parsed = riderSchema.safeParse({
    full_name: fd.get("full_name"),
    phone: fd.get("phone"),
    city_id: Number(fd.get("city_id")),
    vehicle_type: fd.get("vehicle_type"),
    vehicle_plate: String(fd.get("vehicle_plate") ?? "").trim() || undefined,
    national_id: String(fd.get("national_id") ?? "").trim() || undefined,
  });
  if (!parsed.success) return fail("validation");
  const phone = normalizeSaudiPhone(parsed.data.phone);
  if (!phone) return fail("contact_invalid");
  const own = (v: FormDataEntryValue | null) => {
    const p = typeof v === "string" ? v : "";
    return p.startsWith(`${s.user.id}/`) && !p.includes("..") ? p : null;
  };
  const { error } = await s.supabase.from("riders").upsert({
    ...parsed.data, phone, id: s.user.id,
    id_document_path: own(fd.get("id_document_path")),
    license_document_path: own(fd.get("license_document_path")),
  });
  if (error) return fail(errorKey(error));
  revalidatePath("/rider");
  return { ok: true };
}

export async function setOnline(online: boolean, lat?: number, lng?: number): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const { error } = await s.supabase.rpc("rider_set_online", { p_online: online, p_lat: lat ?? null, p_lng: lng ?? null });
  if (error) return fail(errorKey(error));
  revalidatePath("/rider");
  return { ok: true };
}

async function rpc(fn: string, args: Record<string, unknown>, path: string): Promise<ActionResult> {
  const s = await authed();
  if (!s) return fail("not_authenticated");
  const { error } = await s.supabase.rpc(fn, args);
  if (error) return fail(errorKey(error));
  revalidatePath(path);
  return { ok: true };
}

export async function claimJobAction(_: unknown, fd: FormData) {
  return rpc("rider_claim_job", { p_job: String(fd.get("job_id")) }, "/rider");
}
export async function confirmPickupAction(_: unknown, fd: FormData) {
  const id = String(fd.get("job_id"));
  return rpc("rider_confirm_pickup", { p_job: id, p_code: String(fd.get("code") ?? "").trim() }, `/rider/jobs/${id}`);
}
export async function confirmDeliveryAction(_: unknown, fd: FormData) {
  const id = String(fd.get("job_id"));
  return rpc("rider_confirm_delivery", { p_job: id, p_code: String(fd.get("code") ?? "").trim() }, `/rider/jobs/${id}`);
}
export async function releaseJobAction(_: unknown, fd: FormData) {
  return rpc("rider_release_job", { p_job: String(fd.get("job_id")) }, "/rider");
}
export async function failJobAction(_: unknown, fd: FormData) {
  const id = String(fd.get("job_id"));
  const reason = String(fd.get("reason") ?? "");
  const detail = String(fd.get("detail") ?? "").trim();
  return rpc("rider_fail_job", { p_job: id, p_reason: [reason, detail].filter(Boolean).join(": ") }, `/rider/jobs/${id}`);
}
