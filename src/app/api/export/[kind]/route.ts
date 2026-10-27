import { NextResponse, type NextRequest } from "next/server";
import { getActiveLaundry, getSession } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { parseRange } from "@/lib/date-range";

export async function GET(request: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const { supabase, user, profile } = await getSession();
  if (!supabase || !user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const range = parseRange(Object.fromEntries(request.nextUrl.searchParams));
  let rows: (string | number | null)[][] = [];

  if (kind === "partner-orders") {
    const laundry = await getActiveLaundry();
    if (!laundry) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { data } = await supabase.from("orders")
      .select("order_number, created_at, status, fulfillment, contact_name, total, final_total, payment_status, payment_method")
      .eq("laundry_id", laundry.id).gte("created_at", range.fromIso).lte("created_at", range.toIso).order("created_at").limit(10000);
    rows = [["order_number", "created_at", "status", "fulfillment", "customer", "total", "final_total", "payment_status", "payment_method"],
      ...((data ?? []) as Record<string, string | number | null>[]).map((o) => [o.order_number, o.created_at, o.status, o.fulfillment, o.contact_name, o.total, o.final_total, o.payment_status, o.payment_method])];
  } else if (kind === "admin-orders" || kind === "admin-payments") {
    if (!profile?.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (kind === "admin-orders") {
      const { data } = await supabase.from("orders")
        .select("order_number, created_at, status, fulfillment, total, final_total, commission_amount, payment_status, laundries(name)")
        .gte("created_at", range.fromIso).lte("created_at", range.toIso).order("created_at").limit(20000);
      rows = [["order_number", "created_at", "laundry", "status", "fulfillment", "total", "final_total", "commission", "payment_status"],
        ...((data ?? []) as unknown as (Record<string, string | number | null> & { laundries: { name: string } | null })[]).map((o) =>
          [o.order_number, o.created_at, o.laundries?.name ?? "", o.status, o.fulfillment, o.total, o.final_total, o.commission_amount, o.payment_status])];
    } else {
      const { data } = await supabase.from("payments")
        .select("created_at, confirmed_at, kind, method, status, amount, reference, invoice_number, laundries(name)")
        .gte("created_at", range.fromIso).lte("created_at", range.toIso).order("created_at").limit(20000);
      rows = [["created_at", "confirmed_at", "kind", "laundry", "method", "status", "amount", "reference", "invoice_number"],
        ...((data ?? []) as unknown as (Record<string, string | number | null> & { laundries: { name: string } | null })[]).map((p) =>
          [p.created_at, p.confirmed_at, p.kind, p.laundries?.name ?? "", p.method, p.status, p.amount, p.reference, p.invoice_number])];
    }
  } else {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${range.from}-${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
