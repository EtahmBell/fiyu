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
  lavender: { ground: "bg-lavender-50", rule: "bg-lavender-500/40", type: "text-lavender-700/45" },
  champagne: { ground: "bg-gold-soft", rule: "bg-gold/45", type: "text-gold-700/40" },
  cool: { ground: "bg-subtle", rule: "bg-line-strong", type: "text-ink-faint/55" },
};

/**
 * The stand-in for a portrait slot: the area name in the display face, set large
 * and bled off the left edge, over a warm or cool ground.
 *
 * Typographic rather than illustrated, on purpose. The two line drawings Fiyu
 * owns are strong, and repeating them six times across one page was what made
 * the imagery look thin. A type plate reads as an editorial device instead of as
 * a fourth copy of the same picture, and it varies by itself.
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
    <div aria-hidden="true" className={cn("relative size-full overflow-hidden", ground)}>
      <span
        className={cn(
          "absolute bottom-3 -left-2 font-display text-[clamp(2.5rem,5vw,3.5rem)] leading-none tracking-[-0.03em] whitespace-nowrap",
          type,
        )}
      >
        {label}
      </span>
      <span className={cn("absolute top-4 left-4 h-px w-8", rule)} />
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
