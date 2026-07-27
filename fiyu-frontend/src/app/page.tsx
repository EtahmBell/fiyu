import { DiscoveryShell } from "@/components/discovery/DiscoveryShell";
import { PageIntro, SiteFooter } from "@/components/layout/SiteHeader";
import { BackendUnavailable } from "@/components/states/BackendUnavailable";
import { NoPublishedRestaurants } from "@/components/states/EmptyState";
import { MalformedDataNotice } from "@/components/states/MalformedDataNotice";
import { fetchRestaurants } from "@/lib/api/client";
import { type FiyuApiError, isFiyuApiError } from "@/lib/api/errors";
import type { ParsedRestaurantList } from "@/lib/api/schemas";
import { selectBrowsable } from "@/lib/discovery/filters";

type CatalogResult = ({ ok: true } & ParsedRestaurantList) | { ok: false; error: FiyuApiError };

/**
 * Catalog load.
 *
 * All network access goes through the typed client; this route only decides
 * what to render. Expected API failures are caught and turned into a state
 * rather than thrown, so a production build still succeeds while the backend is
 * offline and the page recovers on the next revalidation.
 */
async function loadCatalog(): Promise<CatalogResult> {
  try {
    const { restaurants, rejected } = await fetchRestaurants(100);
    return { ok: true, restaurants, rejected };
  } catch (error) {
    if (isFiyuApiError(error)) return { ok: false, error };
    // Anything unclassified is a genuine bug; let error.tsx handle it.
    throw error;
  }
}

/**
 * Failure and empty states render inside the list column's measure rather than
 * across the full split, so a single message never stretches to 1400px.
 */
function StateColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[38rem] px-5 pb-20 sm:px-8">
      <PageIntro />
      {children}
      <SiteFooter />
    </div>
  );
}

export default async function HomePage() {
  const result = await loadCatalog();

  if (!result.ok) {
    return (
      <main>
        <h2 className="sr-only">Restaurants</h2>
        <StateColumn>
          <BackendUnavailable error={result.error} />
        </StateColumn>
      </main>
    );
  }

  // Withheld rows are filtered here, on the server. Filtering in the client
  // shell would still serialise every withheld restaurant into the RSC payload
  // just to drop it in the browser.
  const { restaurants, withheld } = selectBrowsable(result.restaurants);
  const { rejected } = result;

  if (restaurants.length === 0) {
    return (
      <main>
        <h2 className="sr-only">Restaurants</h2>
        <StateColumn>
          <div className="space-y-4">
            <MalformedDataNotice rejected={rejected} accepted={0} />
            {rejected.length === 0 && <NoPublishedRestaurants withheld={withheld} />}
          </div>
        </StateColumn>
      </main>
    );
  }

  return (
    <main>
      <h2 className="sr-only">Restaurants</h2>
      {rejected.length > 0 && (
        <div className="mx-auto w-full max-w-[38rem] px-5 pt-6 sm:px-8">
          <MalformedDataNotice rejected={rejected} accepted={restaurants.length} />
        </div>
      )}
      <DiscoveryShell restaurants={restaurants} />
    </main>
  );
}
