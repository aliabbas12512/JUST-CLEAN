"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/locale";
import { useI18n } from "@/lib/i18n/client";

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (l: "ar" | "ur") =>
    start(async () => {
      await setLocale(l);
      router.refresh();
    });
  return (
    <div className={`inline-flex rounded-lg bg-slate-100 p-0.5 text-sm ${pending ? "opacity-60" : ""} ${className}`} role="group" aria-label="Language">
      <button type="button" onClick={() => choose("ar")} aria-pressed={locale === "ar"} lang="ar"
        className={`rounded-md px-2.5 py-1 font-semibold ${locale === "ar" ? "bg-white text-brand-900 shadow-sm" : "text-slate-500"}`}>
        العربية
      </button>
      <button type="button" onClick={() => choose("ur")} aria-pressed={locale === "ur"} lang="ur"
        className={`rounded-md px-2.5 py-1 font-semibold ${locale === "ur" ? "bg-white text-brand-900 shadow-sm" : "text-slate-500"}`}
        style={{ fontFamily: "'Noto Nastaliq Urdu', serif", lineHeight: 1.6 }}>
        اردو
      </button>
    </div>
  );
}
