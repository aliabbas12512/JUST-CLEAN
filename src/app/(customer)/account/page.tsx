import Link from "next/link";
import { requestDeletionAction, updateProfileAction } from "@/app/actions/customer";
import { SetupRequired } from "@/components/setup-required";
import { LanguageSwitch } from "@/components/site/language-switch";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Icon, type IconName } from "@/components/ui/icon";
import { Alert, Card, CardHeader, Checkbox, Field, Input, PageHeader } from "@/components/ui/primitives";
import { getMyLaundries, getMyRider, requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { displayPhone } from "@/lib/phone";

export default async function AccountPage() {
  const { t } = await getI18n();
  if (!isSupabaseConfigured) return <SetupRequired />;
  const { user, profile } = await requireUser("/account");
  const [laundries, rider] = await Promise.all([getMyLaundries(), getMyRider()]);

  const links: { href: string; label: string; icon: IconName }[] = [
    { href: "/orders", label: t.nav.orders, icon: "list" },
    { href: "/account/addresses", label: t.account.addresses, icon: "pin" },
    { href: "/account/favorites", label: t.account.favorites, icon: "heart" },
    { href: "/account/packages", label: t.packages.myPackages, icon: "box" },
    { href: "/notifications", label: t.nav.notifications, icon: "bell" },
    { href: "/support", label: t.nav.support, icon: "support" },
  ];
  const workspaces: { href: string; label: string; icon: IconName }[] = [
    { href: "/partner", label: laundries.length ? t.nav.partner : t.nav.forBusiness, icon: "store" },
    { href: "/rider", label: rider ? t.nav.rider : t.nav.becomeRider, icon: "bike" },
    ...(profile?.is_admin ? [{ href: "/admin", label: t.nav.admin, icon: "shield" as IconName }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={t.account.title} subtitle={<span dir="ltr" className="font-num">{displayPhone(profile?.phone) || user.email}</span>} />
      <div className="grid gap-2 sm:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-2xl bg-white p-4 font-semibold text-brand-950 ring-1 ring-[var(--line)] hover:bg-brand-50">
            <Icon name={l.icon} className="size-5 text-brand-700" />{l.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader title={t.account.workspaces} />
        <div className="grid gap-2 p-4 sm:grid-cols-3">
          {workspaces.map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 font-semibold text-brand-950 hover:bg-brand-50">
              <Icon name={l.icon} className="size-5 text-brand-700" />{l.label}
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.account.profile} />
        <ActionForm action={updateProfileAction} successMessage className="space-y-4 p-4">
          <Field label={t.account.fullName}><Input name="full_name" defaultValue={profile?.full_name ?? ""} required minLength={2} maxLength={120} /></Field>
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-950">{t.common.language}</p>
            <LanguageSwitch />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-950">{t.account.notificationPrefs}</p>
            <Checkbox name="notify_sms" defaultChecked={profile?.notify_sms ?? true} label={t.account.notifySms} />
            <Checkbox name="notify_push" defaultChecked={profile?.notify_push ?? true} label={t.account.notifyPush} />
            <Checkbox name="notify_marketing" defaultChecked={profile?.notify_marketing ?? false} label={t.account.notifyMarketing} />
          </div>
          <SubmitButton>{t.common.save}</SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title={t.account.privacy} />
        <div className="space-y-3 p-4">
          {profile?.deletion_requested_at ? <Alert tone="amber">{t.account.deletionRequested}</Alert> : (
            <ActionForm action={async () => { "use server"; return requestDeletionAction(); }}>
              <p className="mb-2 text-sm text-[var(--muted)]">{t.account.deletionNote}</p>
              <SubmitButton variant="secondary" confirmText={t.common.areYouSure}>{t.account.requestDeletion}</SubmitButton>
            </ActionForm>
          )}
          <form action="/auth/signout" method="post">
            <button className="inline-flex items-center gap-2 font-semibold text-red-600"><Icon name="logout" className="size-5" />{t.common.signOut}</button>
          </form>
        </div>
      </Card>
    </div>
  );
}
