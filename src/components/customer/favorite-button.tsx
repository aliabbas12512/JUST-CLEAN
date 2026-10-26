"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFavorite } from "@/app/actions/customer";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/client";

export function FavoriteButton({ laundryId, initial }: { laundryId: string; initial: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [fav, setFav] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={fav}
      aria-label={fav ? t.laundry.removeFavorite : t.laundry.addFavorite}
      onClick={() => {
        const next = !fav;
        setFav(next);
        start(async () => {
          const r = await toggleFavorite(laundryId, next);
          if (!r.ok) {
            setFav(!next);
            if (r.error === "not_authenticated") router.push(`/login?next=/laundry/${laundryId}`);
          }
        });
      }}
      className="rounded-full p-1.5 text-rose-500 hover:bg-rose-50"
    >
      <Icon name="heart" className={`size-5 ${fav ? "fill-rose-500" : ""}`} />
    </button>
  );
}
