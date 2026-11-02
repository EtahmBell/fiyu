"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { fetchMyPicks } from "@/lib/api/client";
import type { MyPick } from "@/lib/api/schemas";
import { completedMyPicks } from "@/lib/my-pick/lifecycle";

function MineRow({ item }: { item: MyPick }) {
  const title = item.name_ja?.trim() || item.name_en?.trim() || "Your Pick";
  const subtitle = item.name_en?.trim() && item.name_en.trim() !== title ? item.name_en.trim() : null;
  const metadata = [item.display_area, item.primary_category].filter(Boolean).join(" · ");

  return (
    <li>
      <article className="rounded-card border border-line bg-surface p-4 shadow-paper" data-testid="mine-restaurant-card">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-my-pick-700 uppercase">
              {item.is_public ? "My Pick" : "Private My Pick"}
            </p>
            <h2 className="mt-1 font-display text-xl leading-tight text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
            {metadata ? <p className="mt-1 text-xs text-ink-muted">{metadata}</p> : null}
          </div>
          {item.fiyu_score !== null ? <ScoreMark score={item.fiyu_score} size="md" tone="my-pick" /> : null}
        </div>
        <div className="mt-3 border-t border-line pt-2">
          {item.is_public && item.place_id ? (
            <Link className="inline-flex min-h-10 items-center text-sm font-semibold text-plum" href={`/restaurants/${encodeURIComponent(item.place_id)}`}>
              View restaurant →
            </Link>
          ) : (
            <p className="text-xs leading-5 text-ink-muted">Private result · visible only to you</p>
          )}
        </div>
      </article>
    </li>
  );
}

export function MineList() {
  const [items, setItems] = useState<MyPick[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchMyPicks({ signal: controller.signal })
      .then((rows) => setItems(completedMyPicks(rows)))
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);

  if (items === null && !error) return <FiyuLoadingScreen contained />;
  if (error) return <p role="status" className="text-sm text-rose-dust">We couldn&rsquo;t load your My Picks.</p>;
  if (!items?.length) {
    return (
      <section role="status" className="rounded-card border border-line bg-my-pick-soft p-5">
        <h2 className="font-display text-2xl text-ink">No My Picks yet</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">Restaurants you bring to Fiyu will stay here after their result is ready.</p>
        <Link href="/picks" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-plum">Try My Pick →</Link>
      </section>
    );
  }

  return (
    <section aria-label="Mine restaurants">
      <p className="mb-4 text-xs font-semibold tracking-[0.1em] text-my-pick-700 uppercase">
        {items.length} {items.length === 1 ? "restaurant" : "restaurants"} you brought to Fiyu
      </p>
      <ul className="space-y-3">{items.map((item) => <MineRow key={item.my_pick_id} item={item} />)}</ul>
    </section>
  );
}
