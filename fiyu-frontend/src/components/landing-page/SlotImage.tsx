import Image from "next/image";

import { IMAGE_SLOTS, type ImageSlotId } from "@/components/landing-page/imageSlots";
import { cn } from "@/lib/utils/cn";

/**
 * One photography slot, rendered.
 *
 * Always fills its container, and the container always sets the aspect box, so
 * the photograph and the drawing it replaced occupy exactly the same space and
 * nothing on the page moves.
 *
 * `next/image` rather than a plain tag, and that matters here: the three sources
 * are 2.9MB, 4.5MB and 8.2MB, and the optimizer is what turns them into a few
 * tens of kilobytes of AVIF at the width each slot actually renders at.
 *
 * Below the fold everything is lazy; the caller opts a slot into eager loading
 * only if it is ever above it. None of the three is, and the hero has no image at
 * all, so the page's LCP is hero text and lazy costs it nothing.
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

  if (slot.available) {
    return (
      <Image
        src={slot.path}
        alt={slot.alt}
        fill
        priority={priority}
        loading={priority ? undefined : "lazy"}
        sizes={sizes}
        // `object-position` comes from the slot rather than the call site: it is a
        // property of the photograph, not of the layout that happens to show it.
        style={{ objectPosition: slot.objectPosition }}
        className={cn("object-cover", className)}
      />
    );
  }

  if (slot.fallback.kind === "plate") {
    return (
      <div
        aria-hidden="true"
        className="flex size-full items-center justify-center bg-gold-soft"
      >
        <span className="font-display text-[1.375rem] leading-none text-gold-700/70">
          {slot.fallback.label}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-px bg-gold/45" />
      </div>
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

/** True while a slot is still showing a drawing rather than a photograph. */
export function slotIsIllustrated(slotId: ImageSlotId): boolean {
  return !IMAGE_SLOTS[slotId].available;
}
