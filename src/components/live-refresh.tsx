"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";

/** Subscribes to Supabase Realtime changes (RLS-filtered) and refreshes server data. */
export function LiveRefresh({ channel, subscriptions, showBadge = true }:
  { channel: string; subscriptions: { table: string; filter?: string }[]; showBadge?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const key = JSON.stringify(subscriptions);
  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    let ch = sb.channel(channel);
    for (const s of JSON.parse(key) as { table: string; filter?: string }[]) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, refresh);
    }
    ch.subscribe();
    // Fallback polling in case realtime is not enabled for the project.
    const poll = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 45000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      sb.removeChannel(ch);
    };
  }, [channel, key, router]);
  if (!showBadge) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
      <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
      {t.order.live}
    </span>
  );
}
