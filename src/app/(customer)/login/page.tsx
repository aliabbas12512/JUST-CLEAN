import { redirect } from "next/navigation";
import { LoginForm } from "@/components/customer/login-form";
import { SetupRequired } from "@/components/setup-required";
import { Card } from "@/components/ui/primitives";
import { getSession } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { safeNext } from "@/lib/safe-next";

export const metadata = { robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { t } = await getI18n();
  const { supabase, user } = await getSession();
  if (!supabase) return <SetupRequired />;
  const next = safeNext((await searchParams).next);
  if (user) redirect(next);
  return (
    <div className="mx-auto max-w-md py-6">
      <Card className="p-6">
        <h1 className="text-2xl font-extrabold text-brand-950">{t.auth.title}</h1>
        <LoginForm next={next} />
        <p className="mt-6 text-xs text-[var(--muted)]">{t.auth.terms}</p>
      </Card>
    </div>
  );
}
