import type { PublicRestaurant } from "@/lib/api/schemas";
import { outboundMapLinks, type OutboundMapLink } from "@/lib/outbound/mapLinks";
import { cn } from "@/lib/utils/cn";

/**
 * `inline` keeps the original underlined text links used by the detail-style
 * card. `footer` is the quieter editorial pair used in a discovery card's
 * action row.
 */
export type OutboundMapActionsVariant = "inline" | "footer";

export interface OutboundMapActionsProps {
  restaurant: PublicRestaurant;
  variant?: OutboundMapActionsVariant;
  className?: string;
}

/**
 * Shortened visible text for restaurant surfaces. The full label stays as the
 * accessible name, and contains the visible text verbatim, so WCAG 2.5.3 holds
 * and voice control still matches what is on screen. On a narrow card footer
 * the trailing "Maps" drops away, which keeps both names inside the label.
 */
const SHORT_LABELS: Record<OutboundMapLink["id"], string> = {
  google: "Google",
  apple: "Apple",
};

function ExternalArrow({ accent = false }: { accent?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={cn(
        "size-3 shrink-0 fill-none",
        accent ? "stroke-lavender-600" : "stroke-current opacity-70",
      )}
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
        "flex max-w-full",
        footer ? "shrink-0 flex-nowrap gap-x-1" : "min-w-0 flex-wrap gap-x-4 gap-y-1",
        className,
      )}
    >
      {links.map((link, index) => (
        <li key={link.id} className={cn("min-w-0 max-w-full", footer && "flex items-center")}>
          {/*
            On a card footer the pair sits in the utility row, so a point
            between them makes it read as one secondary aside rather than as
            two more buttons.
          */}
          {footer && index > 0 && (
            <span aria-hidden="true" className="mr-1 text-ink-faint">·</span>
          )}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            // The card's stretched control covers the whole surface, so these
            // need to sit above it to stay clickable.
            className={cn(
              "relative z-10 break-words transition-colors duration-200 ease-(--ease-fiyu)",
              footer
                ? "inline-flex min-h-10 items-center gap-1 rounded-md px-1.5 text-[0.8125rem] font-medium whitespace-nowrap text-ink-muted transition-[background-color,color] duration-150 hover:bg-lavender-50 hover:text-plum focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lavender-600 active:bg-lavender-100/70"
                : "inline-flex min-h-11 items-center gap-1.5 py-2 pr-3 text-xs font-medium text-lavender-700 underline decoration-line underline-offset-2 hover:text-plum hover:decoration-lavender-500",
            )}
          >
            <span>
              {SHORT_LABELS[link.id]}
              <span className={footer ? "hidden min-[25rem]:inline" : undefined}> Maps</span>
            </span>
            <ExternalArrow accent={footer} />
          </a>
        </li>
      ))}
    </ul>
  );
}
