import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors RestaurantCard's layout so the list does not reflow when data lands. */
export function RestaurantCardSkeleton() {
  return (
    <div className="rounded-card border border-hairline bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <Skeleton className="size-13 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        <Skeleton className="h-5 w-24 rounded-chip" />
        <Skeleton className="h-5 w-32 rounded-chip" />
      </div>
      <div className="mt-3 space-y-1.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </div>
  );
}

export function RestaurantListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <RestaurantCardSkeleton key={index} />
      ))}
    </div>
  );
}
