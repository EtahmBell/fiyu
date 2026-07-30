import type { PublicRestaurant } from "@/lib/api/schemas";
import { outboundMapLinks, type OutboundMapLink } from "@/lib/outbound/mapLinks";
import { cn } from "@/lib/utils/cn";

/**
 * `inline` keeps the original underlined text links used by the detail-style
 * card. `footer` is the compact bordered pair used in a discovery card's action
 * row, where three raw links in a row read as unfinished markup.
 */
export type OutboundMapActionsVariant = "inline" | "footer";

export interface OutboundMapActionsProps {
  restaurant: PublicRestaurant;
  variant?: OutboundMapActionsVariant;
  className?: string;
}

/**
 * Shortened visible text for the footer variant. The full label stays as the
 * accessible name, and contains the visible text verbatim, so WCAG 2.5.3 holds
 * and voice control still matches what is on screen.
 */
const SHORT_LABELS: Record<OutboundMapLink["id"], string> = {
  google: "Google Maps",
  apple: "Apple Maps",
};

function ExternalArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-3 shrink-0 fill-none stroke-current opacity-70"
    >
      <path d="M4 8 8 4M4.5 4H8v3.5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Hand off to the user's own map app.
 *
 * Fiyu does not do directions, live hours or transit. When someone wants to
 * actually go somewhere, that belongs in the app they already use.
 *
 * Which links exist is decided entirely by lib/outbound/mapLinks: verified
 * coordinates when the backend cleared them for navigation, the verified written
 * address otherwise, and nothing at all when neither is available. Gating on
 * isMappable here would have been wrong -- it would hide directions for an
 * approximately-located restaurant that has a perfectly good written address.
 */
export function OutboundMapActions({
  restaurant,
  variant = "inline",
  className,
}: OutboundMapActionsProps) {
  const links = outboundMapLinks(restaurant);
  if (links.length === 0) return null;

  const footer = variant === "footer";

  return (
    <ul
      className={cn(
        "flex min-w-0 max-w-full flex-wrap",
        footer ? "gap-1.5" : "gap-x-4 gap-y-1",
        className,
      )}
    >
      {links.map((link) => (
        <li key={link.id} className="min-w-0 max-w-full">
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={footer ? link.label : undefined}
            // The card's stretched control covers the whole surface, so these
            // need to sit above it to stay clickable.
            className={cn(
              "relative z-10 break-words transition-colors duration-200 ease-(--ease-fiyu)",
              footer
                ? "inline-flex min-h-11 items-center gap-1.5 rounded-chip border border-line bg-surface px-3.5 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
                : "text-xs text-lavender-700 underline decoration-line underline-offset-2 hover:decoration-lavender-500",
            )}
          >
            {footer ? (
              <>
                <ExternalArrow />
                {SHORT_LABELS[link.id]}
              </>
            ) : (
              link.label
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
