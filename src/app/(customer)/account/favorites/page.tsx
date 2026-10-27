import Link from "next/link";
import { FavoriteButton } from "@/components/customer/favorite-button";
import { EmptyState, PageHeader, Stars } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export default async function FavoritesPage() {
  const { t } = await getI18n();
  const { supabase } = await requireUser("/account/favorites");
  const { data } = await supabase.from("favorites").select("laundry_id, laundries(id, name, address, rating_avg, rating_count)").order("created_at", { ascending: false });
  const list = ((data ?? []) as unknown as { laundry_id: string; laundries: { id: string; name: string; address: string; rating_avg: number; rating_count: number } | null }[])
    .filter((f) => f.laundries);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.account.favorites} back="/account" />
      {list.length === 0 ? <EmptyState icon="heart" title={t.account.noFavorites} /> : (
        <ul className="space-y-2">
          {list.map((f) => (
            <li key={f.laundry_id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-[var(--line)]">
              <Link href={`/laundry/${f.laundry_id}`} className="min-w-0">
                <p className="font-bold text-brand-950">{f.laundries!.name}</p>
                <p className="text-sm text-[var(--muted)]">{f.laundries!.address}</p>
                {f.laundries!.rating_count > 0 && <Stars value={f.laundries!.rating_avg} count={f.laundries!.rating_count} />}
              </Link>
              <FavoriteButton laundryId={f.laundry_id} initial />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
