import Image from "next/image";

import { IMAGE_SLOTS, type ImageSlotId, type SlotFallback } from "@/components/landing-page/imageSlots";
import { cn } from "@/lib/utils/cn";

/**
 * One photography slot, rendered.
 *
 * Always fills its container, and the container always sets the aspect box, so
 * swapping a fallback for a real photograph moves nothing on the page. Below the
 * fold everything is lazy; the caller opts a slot into eager loading only if it
 * is ever above it.
 */

const NAMEPLATE_TONES: Record<
  Extract<SlotFallback, { kind: "nameplate" }>["tone"],
  { ground: string; rule: string; type: string }
> = {
  lavender: { ground: "bg-lavender-50", rule: "bg-lavender-500/50", type: "text-lavender-700" },
  champagne: { ground: "bg-gold-soft", rule: "bg-gold/55", type: "text-gold-700" },
  cool: { ground: "bg-subtle", rule: "bg-line-strong", type: "text-ink-muted" },
};

/**
 * The stand-in for a thumbnail slot: the area's initial in the display face over
 * a warm or cool ground, with a hairline under it.
 *
 * Typographic rather than illustrated, on purpose -- repeating the two line
 * drawings Fiyu owns six times across one page was what made the imagery look
 * thin. Small, on purpose too: the earlier version filled a 4:5 box with an area
 * name at 45% opacity, and in a browser recording three of those read as blank
 * panels waiting on a network request rather than as a composition.
 */
function NamePlate({
  label,
  tone,
}: {
  label: string;
  tone: Extract<SlotFallback, { kind: "nameplate" }>["tone"];
}) {
  const { ground, rule, type } = NAMEPLATE_TONES[tone];
  return (
    <div
      aria-hidden="true"
      className={cn("relative flex size-full items-center justify-center overflow-hidden", ground)}
    >
      {/* The initial, not the word: at thumbnail scale a whole area name is a
          smudge, and one letter reads as a mark. */}
      <span className={cn("font-display text-xl leading-none", type)}>{label.charAt(0)}</span>
      <span className={cn("absolute bottom-0 left-0 h-px w-full", rule)} />
    </div>
  );
}

export function SlotImage({
  slot: slotId,
  sizes,
  className,
  priority = false,
}: {
  slot: ImageSlotId;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const slot = IMAGE_SLOTS[slotId];

  if (slot.src) {
    return (
      <Image
        src={slot.src}
        alt={slot.alt}
        fill
        priority={priority}
        loading={priority ? undefined : "lazy"}
        sizes={sizes}
        className={cn("object-cover object-center", className)}
      />
    );
  }

  if (slot.fallback.kind === "illustration") {
    return (
      <Image
        src={slot.fallback.src}
        alt={slot.fallback.alt}
        fill
        priority={priority}
        loading={priority ? undefined : "lazy"}
        sizes={sizes}
        className={cn("object-cover object-center", className)}
      />
    );
  }

  return <NamePlate label={slot.fallback.label} tone={slot.fallback.tone} />;
}

/**
 * True while a slot is still showing a drawing rather than a photograph.
 *
 * The restaurant moment captions itself as an illustration while it is one, and
 * stops doing so the moment a real photograph lands. Saying which it is beats
 * letting a reader assume Fiyu photographed the place.
 */
export function slotIsIllustrated(slotId: ImageSlotId): boolean {
  const slot = IMAGE_SLOTS[slotId];
  return slot.src === null && slot.fallback.kind === "illustration";
}
