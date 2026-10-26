import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

// Moyasar (Saudi payment gateway) hosted invoices. Requires MOYASAR_SECRET_KEY.
// We never trust redirect parameters or webhook bodies: payment status is
// always re-fetched from the Moyasar API with our secret key before confirming.
const API = "https://api.moyasar.com/v1";

function auth() {
  const key = process.env.MOYASAR_SECRET_KEY;
  if (!key) throw new Error("MOYASAR_SECRET_KEY is not set");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export type MoyasarInvoice = { id: string; status: string; amount: number; currency: string; url: string; metadata?: Record<string, string> | null };

export async function createInvoice(input: { amountSar: number; description: string; paymentId: string; successUrl: string; backUrl: string; callbackUrl: string }): Promise<MoyasarInvoice> {
  const res = await fetch(`${API}/invoices`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(input.amountSar * 100), // halalas
      currency: "SAR",
      description: input.description,
      success_url: input.successUrl,
      back_url: input.backUrl,
      callback_url: input.callbackUrl,
      metadata: { payment_id: input.paymentId },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Moyasar invoice create failed: ${res.status}`);
  return (await res.json()) as MoyasarInvoice;
}

export async function fetchInvoice(id: string): Promise<MoyasarInvoice | null> {
  if (!/^[0-9a-zA-Z-]{8,64}$/.test(id)) return null;
  const res = await fetch(`${API}/invoices/${id}`, { headers: { Authorization: auth() }, cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as MoyasarInvoice;
}

/** Confirms our payment row if the Moyasar invoice is paid for the exact amount. Idempotent. */
export async function settleInvoice(invoiceId: string): Promise<"paid" | "unpaid" | "invalid"> {
  const inv = await fetchInvoice(invoiceId);
  if (!inv) return "invalid";
  const paymentId = inv.metadata?.payment_id;
  if (!paymentId || inv.currency !== "SAR") return "invalid";
  if (inv.status !== "paid") return "unpaid";
  const sb = createServiceClient();
  const { data: p } = await sb.from("payments").select("id, amount, reference, status").eq("id", paymentId).maybeSingle();
  if (!p || p.reference !== inv.id) return "invalid";
  if (Math.round(Number(p.amount) * 100) !== inv.amount) return "invalid";
  const { error } = await sb.rpc("system_confirm_online_payment", {
    p_payment: paymentId, p_provider: "moyasar", p_provider_id: inv.id, p_amount: Number(p.amount),
  });
  if (error && !/payment_not_pending/.test(error.message)) throw error;
  return "paid";
}
