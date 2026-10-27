"use client";
import { useState, useTransition } from "react";
import { setOnline } from "@/app/actions/rider";
import { Alert } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";

export function OnlineToggle({ online }: { online: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const go = (next: boolean) => {
    setError(null);
    const send = (lat?: number, lng?: number) =>
      start(async () => {
        const r = await setOnline(next, lat, lng);
        if (!r.ok) setError((t.errors as Record<string, string>)[r.error] ?? t.errors.generic);
      });
    if (next && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => send(p.coords.latitude, p.coords.longitude), () => send(), { timeout: 10000 });
    } else send();
  };

  return (
    <div className={`rounded-2xl p-4 ${online ? "bg-emerald-600 text-white" : "bg-white ring-1 ring-[var(--line)]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold">{online ? t.rider.online : t.rider.offline}</p>
          <p className={`text-sm ${online ? "text-emerald-50" : "text-[var(--muted)]"}`}>{t.rider.onlineHint}</p>
        </div>
        <button type="button" disabled={pending} onClick={() => go(!online)}
          className={`h-12 shrink-0 rounded-xl px-5 font-bold ${online ? "bg-white text-emerald-700" : "bg-emerald-600 text-white"} disabled:opacity-60`}>
          {pending ? t.common.loading : online ? t.rider.goOffline : t.rider.goOnline}
        </button>
      </div>
      <p className={`mt-2 text-xs ${online ? "text-emerald-100" : "text-slate-400"}`}>{t.rider.locationShared}</p>
      {error && <div className="mt-2"><Alert tone="red">{error}</Alert></div>}
    </div>
  );
}
