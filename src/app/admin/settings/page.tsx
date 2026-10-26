import { saveSettingsAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Card, CardHeader, Checkbox, Field, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import type { PlatformSettings } from "@/lib/types";

function N({ s, name, label, step = "1", min = 0 }: { s: PlatformSettings; name: keyof PlatformSettings; label: string; step?: string; min?: number }) {
  return <Field label={label}><Input name={name} type="number" step={step} min={min} defaultValue={String(s[name] ?? "")} required dir="ltr" /></Field>;
}

export default async function AdminSettings() {
  const { t } = await getI18n();
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("platform_settings").select("*").eq("id", 1).single();
  const s = data as PlatformSettings;
  const k = t.admin.settings;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.admin.nav.settings} />
      <ActionForm action={saveSettingsAction} successMessage className="space-y-4">
        <Card>
          <CardHeader title={t.admin.nav.subscriptions} />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <N s={s} name="partner_subscription_price" label={k.subscriptionPrice} step="0.01" />
            <N s={s} name="billing_cycle_months" label={k.billingCycle} min={1} />
            <N s={s} name="trial_days" label={k.trialDays} />
            <N s={s} name="grace_days" label={k.graceDays} />
            <div className="sm:col-span-2"><Checkbox name="require_active_subscription" defaultChecked={s.require_active_subscription} label={k.requireSub} /></div>
            <div className="sm:col-span-2"><Checkbox name="commission_enabled" defaultChecked={s.commission_enabled} label={k.commissionEnabled} /></div>
            <N s={s} name="commission_percent" label={k.commissionPercent} step="0.01" />
            <N s={s} name="vat_rate" label={k.vatRate} step="0.01" />
          </div>
        </Card>
        <Card>
          <CardHeader title={t.admin.nav.orders} />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <N s={s} name="order_accept_timeout_minutes" label={k.acceptTimeout} min={1} />
            <N s={s} name="auto_complete_hours" label={k.autoComplete} min={1} />
            <N s={s} name="default_service_radius_km" label={k.defaultRadius} step="0.5" />
            <N s={s} name="max_search_radius_km" label={k.maxRadius} step="0.5" />
            <N s={s} name="rider_fee_per_leg" label={k.riderFee} step="0.5" />
            <N s={s} name="max_active_jobs_per_rider" label={k.maxJobs} min={1} />
            <Field label={k.orderPrefix}><Input name="order_prefix" defaultValue={s.order_prefix} pattern="[A-Za-z]{1,5}" required dir="ltr" /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title={t.nav.support} />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label={k.supportPhone}><Input name="support_phone" defaultValue={s.support_phone ?? ""} dir="ltr" /></Field>
            <Field label={k.supportWhatsapp}><Input name="support_whatsapp" defaultValue={s.support_whatsapp ?? ""} dir="ltr" /></Field>
            <Field label={k.bankInstructions} className="sm:col-span-2"><Textarea name="bank_transfer_instructions" defaultValue={s.bank_transfer_instructions ?? ""} rows={4} maxLength={2000} /></Field>
          </div>
        </Card>
        <SubmitButton size="lg" confirmText={t.common.areYouSure}>{t.common.save}</SubmitButton>
      </ActionForm>
    </div>
  );
}
