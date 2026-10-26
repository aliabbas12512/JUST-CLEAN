import { NextResponse, type NextRequest } from "next/server";
import { isOnlinePaymentConfigured } from "@/lib/env";
import { settleInvoice } from "@/lib/payments/moyasar";

// The body is only used to find the invoice id; status is re-fetched from Moyasar.
export async function POST(request: NextRequest) {
  if (!isOnlinePaymentConfigured) return NextResponse.json({ ok: false }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { id?: string; invoice_id?: string; data?: { id?: string; invoice_id?: string } } | null;
  const invoiceId = body?.data?.invoice_id ?? body?.invoice_id ?? body?.id;
  if (!invoiceId) return NextResponse.json({ ok: false }, { status: 400 });
  const result = await settleInvoice(invoiceId);
  return NextResponse.json({ ok: result !== "invalid", result });
}
