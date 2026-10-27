"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveLaundry } from "@/app/actions/partner";
import { useI18n } from "@/lib/i18n/client";

export function BranchSwitcher({ laundries, activeId }: { laundries: { id: string; name: string }[]; activeId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={t.partner.switchBranch}
      value={activeId}
      disabled={pending}
      onChange={(e) => start(async () => { await setActiveLaundry(e.target.value); router.refresh(); })}
      className="h-9 max-w-40 rounded-lg bg-white px-2 text-sm ring-1 ring-[var(--line)]"
    >
      {laundries.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  );
}
