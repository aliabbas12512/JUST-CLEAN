import { NextResponse, type NextRequest } from "next/server";
import { isServiceRoleConfigured } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

// Called by Vercel Cron (see vercel.json). Prefer pg_cron for frequent runs;
// Vercel Hobby plans only allow daily crons, which is too slow for order-acceptance timeouts.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isServiceRoleConfigured) return NextResponse.json({ error: "service role not configured" }, { status: 503 });
  const { data, error } = await createServiceClient().rpc("run_maintenance");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
