import { NextResponse, type NextRequest } from "next/server";
import { isOnlinePaymentConfigured } from "@/lib/env";
import { settleInvoice } from "@/lib/payments/moyasar";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const back = new URL("/partner/subscription", request.nextUrl.origin);
  const paymentId = request.nextUrl.searchParams.get("payment_id");
  if (!isOnlinePaymentConfigured || !paymentId || !/^[0-9a-f-]{36}$/.test(paymentId)) return NextResponse.redirect(back);
  const { data: p } = await createServiceClient().from("payments").select("reference").eq("id", paymentId).maybeSingle();
  const result = p?.reference ? await settleInvoice(p.reference) : "invalid";
  back.searchParams.set("payment", result);
  return NextResponse.redirect(back);
}
