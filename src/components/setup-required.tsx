import { getI18n } from "@/lib/i18n/server";
import { Alert } from "@/components/ui/primitives";

export async function SetupRequired() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-xl py-10">
      <Alert tone="amber" title={t.setup.title}>
        <p>{t.setup.body}</p>
        <p className="mt-2 font-semibold">{t.setup.vars}:</p>
        <code dir="ltr" className="mt-1 block rounded bg-white/70 p-2 text-xs">NEXT_PUBLIC_SUPABASE_URL<br />NEXT_PUBLIC_SUPABASE_ANON_KEY<br />SUPABASE_SERVICE_ROLE_KEY</code>
      </Alert>
    </div>
  );
}
