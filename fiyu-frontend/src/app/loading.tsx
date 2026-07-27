import { RestaurantListSkeleton } from "@/components/restaurant/RestaurantCardSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Shown while the catalog is being fetched.
 *
 * Mirrors the real split so nothing jumps when data lands: the masthead is
 * already final, only the list and map panes are placeholders. The brand bar
 * lives in the layout and stays put.
 *
 * The route is statically prerendered with a 5-minute revalidation window, so
 * in practice this appears during client-side navigation and revalidation
 * rather than on a cold first paint.
 */
export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="lg:grid lg:h-[calc(100dvh-var(--spacing-header))] lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]"
    >
      <div className="min-w-0 lg:overflow-hidden">
        <div className="mx-auto w-full max-w-[38rem] px-5 pb-20 sm:px-8 lg:mx-0 lg:max-w-none">
          {/* Skeleton masthead rather than the real <h1>. The heading belongs
              to the resolved page; rendering it here too would put two <h1>
              elements into the streamed HTML. */}
          <div aria-hidden="true" className="px-1 pt-8 pb-6 sm:pt-10">
            <Skeleton className="h-12 w-40 sm:h-14" />
            <Skeleton className="mt-4 h-3.5 w-full max-w-md" />
            <Skeleton className="mt-2 h-3.5 w-2/3 max-w-md" />
          </div>

          {/* One announcement for the whole region; the skeletons are
              aria-hidden so nothing reads out a list of empty boxes. */}
          <p role="status" className="sr-only">
            Loading restaurants
          </p>

          <div aria-hidden="true" className="flex gap-2 pt-4 pb-3">
            <Skeleton className="h-11 w-24 rounded-chip" />
            <Skeleton className="h-11 w-28 rounded-chip" />
          </div>

          <RestaurantListSkeleton count={5} />
        </div>
      </div>

      <div aria-hidden="true" className="hidden bg-subtle lg:block lg:border-l lg:border-line" />
    </main>
  );
}
