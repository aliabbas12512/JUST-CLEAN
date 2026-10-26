"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/shared";
import { normalizeSaudiPhone } from "@/lib/phone";
import { getBrowserClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [step, setStep] = useState<"ask" | "verify">("ask");
  const [identifier, setIdentifier] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sb = getBrowserClient();

  const send = async () => {
    if (!sb) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "phone") {
        const phone = normalizeSaudiPhone(identifier);
        if (!phone) return setError(t.auth.invalidPhone);
        const { error } = await sb.auth.signInWithOtp({ phone: `+${phone}` });
        if (error) return setError(/provider|sms|phone/i.test(error.message) ? t.auth.smsNotConfigured : error.message);
        setSentTo(`+${phone}`);
      } else {
        const email = identifier.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t.errors.validation);
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) return setError(error.message);
        setSentTo(email);
      }
      setStep("verify");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!sb) return;
    setError(null);
    setBusy(true);
    const { error } = mode === "phone"
      ? await sb.auth.verifyOtp({ phone: sentTo, token: code.trim(), type: "sms" })
      : await sb.auth.verifyOtp({ email: sentTo, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError(t.auth.invalidCode);
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="mt-4 space-y-4">
      {step === "ask" ? (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-4">
          <p className="text-sm text-[var(--muted)]">{mode === "phone" ? t.auth.subtitle : t.auth.emailSubtitle}</p>
          {mode === "phone" ? (
            <Field label={t.auth.phone}>
              <div className="flex gap-2" dir="ltr">
                <span className="flex items-center rounded-xl bg-slate-100 px-3 font-semibold text-slate-600">+966</span>
                <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} inputMode="tel" autoComplete="tel-national" placeholder={t.auth.phonePlaceholder} required />
              </div>
            </Field>
          ) : (
            <Field label={t.common.email}>
              <Input type="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} dir="ltr" autoComplete="email" required />
            </Field>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? t.common.loading : t.auth.sendCode}</Button>
          <button type="button" className="w-full text-sm font-semibold text-brand-700" onClick={() => { setMode(mode === "phone" ? "email" : "phone"); setIdentifier(""); setError(null); }}>
            {mode === "phone" ? t.auth.useEmail : t.auth.usePhone}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-4">
          <p className="text-sm text-[var(--muted)]">{fmt(t.auth.codeSent, { phone: sentTo })}</p>
          <Field label={t.auth.code}>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" dir="ltr" className="text-center text-2xl tracking-[0.4em]" required />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 6}>{busy ? t.common.loading : t.auth.verify}</Button>
          <button type="button" className="w-full text-sm font-semibold text-brand-700" onClick={() => { setStep("ask"); setCode(""); }}>{t.auth.resend}</button>
        </form>
      )}
      {error && <Alert tone="red">{error}</Alert>}
    </div>
  );
}
