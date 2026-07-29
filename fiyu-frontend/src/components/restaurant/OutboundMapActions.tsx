import type { PublicRestaurant } from "@/lib/api/schemas";
import { outboundMapLinks } from "@/lib/outbound/mapLinks";
import { cn } from "@/lib/utils/cn";

export interface OutboundMapActionsProps {
  restaurant: PublicRestaurant;
  className?: string;
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
export function OutboundMapActions({ restaurant, className }: OutboundMapActionsProps) {
  const links = outboundMapLinks(restaurant);
  if (links.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1", className)}>
      {links.map((link) => (
        <li key={link.id}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            // The card's stretched control covers the whole surface, so these
            // need to sit above it to stay clickable.
            className="relative z-10 text-xs text-lavender-700 underline decoration-line underline-offset-2 transition-colors duration-200 ease-(--ease-fiyu) hover:decoration-lavender-500"
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
