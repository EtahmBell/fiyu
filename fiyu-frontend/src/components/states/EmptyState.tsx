"use client";

import { Button } from "@/components/ui/Button";
import { StatusMessage } from "@/components/ui/StatusMessage";

export interface NoPublishedRestaurantsProps {
  /** Rows the backend published but the browsable filter withheld. */
  withheld?: number;
}

/**
 * Nothing to browse. This is an expected editorial state, not a failure: the
 * catalog only contains restaurants an operator has manually published via
 * `python -m fiyu.public_cli publish`.
 *
 * The two causes are distinguished because they need different fixes -- an
 * empty catalog needs publishing, whereas a fully withheld one needs the
 * score-band filter relaxed.
 */
export function NoPublishedRestaurants({ withheld = 0 }: NoPublishedRestaurantsProps) {
  if (withheld > 0) {
    return (
      <StatusMessage
        tone="empty"
        title="Nothing to show right now"
        description={
          <p>
            All {withheld} published {withheld === 1 ? "restaurant is" : "restaurants are"}{" "}
            currently withheld from the browsable lists.
          </p>
        }
      />
    );
  }

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

export interface ModeUnavailableProps {
  label: string;
  onBrowseLocal: () => void;
}

/**
 * A discovery mode with no data source behind it yet.
 *
 * Deliberately distinct from "no restaurants matched": this is not an empty
 * result, it is a list that does not exist yet, and conflating the two would
 * imply the catalog had been searched and come back empty.
 */
export function ModeUnavailable({ label, onBrowseLocal }: ModeUnavailableProps) {
  return (
    <StatusMessage
      tone="empty"
      live
      title={`${label} isn't available yet`}
      description={
        <p>
          This list will appear once {label.toLowerCase()} data is connected. Nothing here is
          inferred from the Fiyu score in the meantime.
        </p>
      }
      action={
        <Button variant="primary" onClick={onBrowseLocal}>
          Browse Local instead
        </Button>
      }
    />
  );
}
