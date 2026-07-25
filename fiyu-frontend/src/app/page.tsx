import { DiscoveryShell } from "@/components/discovery/DiscoveryShell";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import { BackendUnavailable } from "@/components/states/BackendUnavailable";
import { NoPublishedRestaurants } from "@/components/states/EmptyState";
import { MalformedDataNotice } from "@/components/states/MalformedDataNotice";
import { fetchRestaurants } from "@/lib/api/client";
import { type FiyuApiError, isFiyuApiError } from "@/lib/api/errors";
import type { ParsedRestaurantList } from "@/lib/api/schemas";
import { isMapConfigured } from "@/lib/config/env";

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

function Catalog({ result }: { result: CatalogResult }) {
  if (!result.ok) {
    return <BackendUnavailable error={result.error} />;
  }

  const { restaurants, rejected } = result;

  if (restaurants.length === 0) {
    return (
      <div className="space-y-4">
        <MalformedDataNotice rejected={rejected} accepted={0} />
        {rejected.length === 0 && <NoPublishedRestaurants />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MalformedDataNotice rejected={rejected} accepted={restaurants.length} />
      <DiscoveryShell restaurants={restaurants} />
    </div>
  );
}

export default async function HomePage() {
  const result = await loadCatalog();

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0">
        <h2 className="sr-only">Restaurants</h2>
        <Catalog result={result} />
      </section>

      <aside className="min-w-0" aria-label="Map">
        <div className="overflow-hidden rounded-card border border-hairline lg:sticky lg:top-8">
          {isMapConfigured() ? (
            <div className="flex min-h-80 items-center justify-center bg-sunken px-6 text-center">
              <p className="text-sm leading-relaxed text-ink-muted">
                Browser map key detected. The interactive map is built in Phase 4.
              </p>
            </div>
          ) : (
            <MapUnavailable reason="missing-key" className="min-h-80" />
          )}
        </div>
      </aside>
    </main>
  );
}
