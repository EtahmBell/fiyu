import { RestaurantListSkeleton } from "@/components/restaurant/RestaurantCardSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Shown while the catalog is being fetched.
 *
 * Covers only the content area: the masthead and footer live in the layout, so
 * they stay on screen rather than flashing. The route is statically prerendered
 * with a 5-minute revalidation window, so in practice this appears during
 * client-side navigation and revalidation rather than on a cold first paint.
 */
export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_24rem]"
    >
      <section className="min-w-0 space-y-5">
        {/* One announcement for the whole region; the skeletons themselves are
            aria-hidden so nothing reads out a list of empty boxes. */}
        <p role="status" className="sr-only">
          Loading restaurants
        </p>
        <div aria-hidden="true" className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-chip" />
          <Skeleton className="h-9 w-32 rounded-chip" />
        </div>
        <RestaurantListSkeleton count={5} />
      </section>

      <aside className="min-w-0">
        <Skeleton className="min-h-80 w-full rounded-card" />
      </aside>
    </main>
  );
}
