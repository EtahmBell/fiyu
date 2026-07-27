import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Content-shaped placeholder.
 *
 * Mirrors the real card's geometry -- band kicker, display-size name, English
 * subtitle, meta line, score mark, three prose lines and a tag row -- so the
 * list does not reflow when data lands. Line widths are varied deliberately;
 * uniform full-width bars are what make skeletons look like a template.
 */
export function RestaurantCardSkeleton() {
  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-2 w-16 rounded-full" />
          <Skeleton className="h-7 w-3/5" />
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Skeleton className="h-2 w-7 rounded-full" />
          <Skeleton className="h-7 w-10" />
          <Skeleton className="h-px w-7" />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-[92%]" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>

      <div className="mt-4 flex gap-1.5">
        <Skeleton className="h-6 w-20 rounded-chip" />
        <Skeleton className="h-6 w-16 rounded-chip" />
        <Skeleton className="h-6 w-24 rounded-chip" />
      </div>
    </div>
  );
}

export function RestaurantListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="-mx-1">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="border-b border-line last:border-b-0">
          <RestaurantCardSkeleton />
        </li>
      ))}
    </ul>
  );
}
