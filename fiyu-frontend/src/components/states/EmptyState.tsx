import { StatusMessage } from "@/components/ui/StatusMessage";

/**
 * Nothing published yet. This is an expected editorial state, not a failure:
 * the catalog only contains restaurants an operator has manually published via
 * `python -m fiyu.public_cli publish`.
 */
export function NoPublishedRestaurants() {
  return (
    <StatusMessage
      tone="empty"
      title="No restaurants published yet"
      description={
        <div className="space-y-2">
          <p>
            The catalog is empty. Restaurants appear here once they are published from the
            backend.
          </p>
          <pre className="overflow-x-auto rounded bg-surface p-3 font-mono text-xs text-ink-muted">
            python -m fiyu.public_cli --db data/fiyu.db review --limit 20{"\n"}
            python -m fiyu.public_cli --db data/fiyu.db publish --place-id PLACE_ID
          </pre>
        </div>
      }
    />
  );
}
