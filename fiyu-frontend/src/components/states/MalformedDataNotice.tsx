import { StatusMessage } from "@/components/ui/StatusMessage";
import type { RejectedRestaurant } from "@/lib/api/schemas";

export interface MalformedDataNoticeProps {
  rejected: RejectedRestaurant[];
  /** How many rows did validate, so the notice can be phrased precisely. */
  accepted: number;
}

/**
 * Some rows failed schema validation and were dropped.
 *
 * Surfaced rather than swallowed: silently rendering 19 of 22 restaurants would
 * look like a complete catalog and hide a real backend data problem. The count
 * is shown to users; the per-row Zod issues are developer detail, so they go in
 * a collapsed <details> instead of the main copy.
 */
export function MalformedDataNotice({ rejected, accepted }: MalformedDataNoticeProps) {
  if (rejected.length === 0) return null;

  const noneUsable = accepted === 0;

  return (
    <StatusMessage
      tone={noneUsable ? "error" : "warning"}
      title={
        noneUsable
          ? "The catalog data couldn't be read"
          : `${rejected.length} restaurant${rejected.length === 1 ? "" : "s"} couldn't be displayed`
      }
      description={
        <div className="space-y-2">
          <p>
            {noneUsable
              ? "Every record the backend returned failed validation, so none can be shown."
              : `${accepted} loaded normally. The rest didn't match the expected shape and were skipped.`}
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-ink-faint">Technical detail</summary>
            <ul className="mt-2 space-y-1 font-mono text-ink-faint">
              {rejected.slice(0, 5).map((row) => (
                <li key={`${row.index}-${row.placeId ?? "unknown"}`}>
                  row {row.index}
                  {row.placeId ? ` (${row.placeId})` : ""}: {row.issues}
                </li>
              ))}
              {rejected.length > 5 && <li>…and {rejected.length - 5} more</li>}
            </ul>
          </details>
        </div>
      }
    />
  );
}
