import Image from "next/image";

import { IMAGE_SLOTS, type ImageSlotId } from "@/components/landing-page/imageSlots";
import { cn } from "@/lib/utils/cn";

/**
 * One photography slot, rendered.
 *
 * Always fills its container, and the container always sets the aspect box, so
 * swapping a fallback for a real photograph moves nothing on the page. Below the
 * fold everything is lazy; the caller opts a slot into eager loading only if it
 * is ever above it.
 */

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
