"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/client";
import type { City } from "@/lib/types";

const KEY = "jc_loc";

export function LocationBar({ cities, compact = false }: { cities: City[]; compact?: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "locating" | "denied" | "unsupported">("idle");
  const hasLocation = params.has("lat") || params.has("city");

  // Restore the last chosen location once, so returning visitors land on results.
  useEffect(() => {
    if (hasLocation) return;
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) router.replace(`/?${saved}`);
    } catch {}
  }, [hasLocation, router]);

  const go = (qs: URLSearchParams) => {
    try { localStorage.setItem(KEY, qs.toString()); } catch {}
    router.push(`/?${qs.toString()}`);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setState("unsupported");
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState("idle");
        go(new URLSearchParams({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }));
      },
      () => setState("denied"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  const currentCity = params.get("city") ?? "";

  return (
    <div className={compact ? "" : "rounded-2xl bg-white p-4 ring-1 ring-[var(--line)]"}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={locate} disabled={state === "locating"}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          <Icon name="locate" className="size-5" />
          {state === "locating" ? t.home.locating : t.home.useMyLocation}
        </button>
        <select
          aria-label={t.home.chooseCity}
          value={currentCity}
          onChange={(e) => e.target.value && go(new URLSearchParams({ city: e.target.value }))}
          className="h-11 flex-1 rounded-xl bg-white px-3 text-brand-950 ring-1 ring-inset ring-[var(--line)] focus:ring-2 focus:ring-brand-500"
        >
          <option value="">{t.home.chooseCity}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>{locale === "ur" ? c.name_ur : c.name_ar}</option>
          ))}
        </select>
      </div>
      {(state === "denied" || state === "unsupported") && (
        <p className="mt-2 text-sm text-amber-700">{state === "denied" ? t.home.locationDenied : t.home.locationUnsupported}</p>
      )}
    </div>
  );
}
