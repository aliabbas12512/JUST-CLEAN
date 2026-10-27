import { NextResponse, type NextRequest } from "next/server";
import { getActiveLaundry, getSession } from "@/lib/auth";
import { isOnlinePaymentConfigured, siteUrl } from "@/lib/env";
import { createInvoice } from "@/lib/payments/moyasar";
import { createServiceClient } from "@/lib/supabase/server";

// Starts an online subscription payment and redirects the partner to the hosted Moyasar invoice.
export async function POST(request: NextRequest) {
  const back = new URL("/partner/subscription", request.nextUrl.origin);
  if (!isOnlinePaymentConfigured) return NextResponse.redirect(`${back}?error=payment_method_unavailable`, 303);
  const { supabase, user } = await getSession();
  if (!supabase || !user) return NextResponse.redirect(new URL("/login?next=/partner/subscription", request.nextUrl.origin), 303);
  const laundry = await getActiveLaundry();
  if (!laundry) return NextResponse.redirect(back, 303);

  const { data, error } = await supabase.rpc("partner_start_online_subscription_payment", { p_laundry: laundry.id });
  if (error) return NextResponse.redirect(`${back}?error=${encodeURIComponent(error.message)}`, 303);
  const { payment_id, amount } = data as { payment_id: string; amount: number };

  const base = siteUrl();
  const invoice = await createInvoice({
    amountSar: Number(amount),
    description: `Subscription — ${laundry.name}`,
    paymentId: payment_id,
    successUrl: `${base}/api/payments/moyasar/return?payment_id=${payment_id}`,
    backUrl: `${base}/partner/subscription`,
    callbackUrl: `${base}/api/payments/moyasar/webhook`,
  });
  // Bind the invoice to our payment row so only this invoice can settle it.
  await createServiceClient().from("payments").update({ reference: invoice.id, provider: "moyasar" }).eq("id", payment_id);
  return NextResponse.redirect(invoice.url, 303);
}
