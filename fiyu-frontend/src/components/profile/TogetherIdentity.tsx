"use client";

import Image from "next/image";

import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils/cn";

/**
 * The shared marks of Fiyu Together.
 *
 * Together appears on five surfaces -- the Picks entry, the hub, the reveal,
 * Your Fiyu and the invitation -- and the thing that has to be the same on all
 * five is the pair: two faces and the glyph between them. That mark lives here
 * so a partner is drawn identically at 24px inside a one-line entry and at 88px
 * on the reveal screen, and so no surface invents its own idea of what a
 * missing avatar looks like.
 *
 * The glyph is a multiplication sign, not a heart and not an ampersand. Fiyu
 * Together is used by couples, but it is also used by two colleagues deciding
 * where to eat, and the mark has to be true for both. `×` says the Picks are
 * the product of two tastes, which is literally what the backend computed.
 */

/** The Together wordmark, matching the micro-caps used across the app. */
export const TOGETHER_CAPS = "text-[0.625rem] font-semibold tracking-[0.16em] uppercase";

export interface TogetherPerson {
  displayName: string;
  avatarUrl?: string | null;
}

export type TogetherMarkTone = "light" | "deep";
export type TogetherMarkSize = "xs" | "sm" | "md" | "lg";

const AVATAR_SIZES: Record<TogetherMarkSize, string> = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-9 text-sm",
  md: "size-12 text-base",
  lg: "size-[4.5rem] text-2xl sm:size-[5.5rem] sm:text-3xl",
};

const GLYPH_SIZES: Record<TogetherMarkSize, string> = {
  xs: "text-[0.625rem]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-xl sm:text-2xl",
};

const GAPS: Record<TogetherMarkSize, string> = {
  xs: "gap-1.5",
  sm: "gap-2",
  md: "gap-2.5",
  lg: "gap-4 sm:gap-5",
};

/**
 * Tone, not colour choice.
 *
 * `light` is the pale-plum and white surfaces; `deep` is the plum-900 ground
 * used by the reveal and the hub masthead. Both carry a visible edge, so an
 * avatar is legible as a face-shaped object even when the image fails.
 */
const TONE_CLASSES: Record<TogetherMarkTone, string> = {
  light: "border-plum-line bg-plum-100 text-plum-700",
  deep: "border-white/25 bg-white/10 text-white",
};

const GLYPH_TONE: Record<TogetherMarkTone, string> = {
  light: "text-plum-500",
  deep: "text-plum-mist",
};

/** Matches the reduced-motion contract used by the rest of the app. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

export function togetherInitial(displayName: string | null | undefined): string {
  return (displayName?.trim()[0] ?? "?").toUpperCase();
}

export function TogetherAvatar({
  person,
  size = "md",
  tone = "light",
  className,
  style,
}: {
  person: TogetherPerson;
  size?: TogetherMarkSize;
  tone?: TogetherMarkTone;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      // The name is always set in type beside or beneath the mark, so the
      // avatar itself is decorative and is kept out of the accessible name.
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-display leading-none",
        AVATAR_SIZES[size],
        TONE_CLASSES[tone],
        className,
      )}
      style={style}
    >
      {person.avatarUrl ? (
        <Image src={person.avatarUrl} alt="" fill unoptimized className="object-cover" />
      ) : (
        <span>{togetherInitial(person.displayName)}</span>
      )}
    </span>
  );
}

/**
 * The pair.
 *
 * Both participants at equal weight with the glyph between them -- neither one
 * is the subject and the other a guest. When `animate` is set the two faces
 * approach from opposite sides and the glyph resolves last; the motion is
 * carried by keyframes rather than a held transform so the global
 * reduced-motion rule collapses it, and the offsets are dropped as well so
 * nothing is left translated.
 */
export function TogetherPairMark({
  people,
  size = "md",
  tone = "light",
  animate = false,
  className,
}: {
  people: TogetherPerson[];
  size?: TogetherMarkSize;
  tone?: TogetherMarkTone;
  animate?: boolean;
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const moving = animate && !reducedMotion;
  const pair = people.slice(0, 2);

  return (
    <span className={cn("inline-flex items-center", GAPS[size], className)}>
      {pair.map((person, index) => (
        <span key={`${person.displayName}-${index}`} className="contents">
          {index > 0 && (
            <span
              aria-hidden="true"
              className={cn("font-display leading-none", GLYPH_SIZES[size], GLYPH_TONE[tone])}
              style={
                moving
                  ? { animation: "fiyu-together-join 260ms var(--ease-fiyu) 360ms both" }
                  : undefined
              }
            >
              ×
            </span>
          )}
          <TogetherAvatar
            person={person}
            size={size}
            tone={tone}
            style={
              moving
                ? {
                    // Inward from opposite sides: the first face from the left,
                    // the second from the right.
                    ["--fiyu-together-from" as string]: index === 0 ? "-14px" : "14px",
                    animation: `fiyu-together-approach 360ms var(--ease-fiyu) ${index * 90}ms both`,
                  }
                : undefined
            }
          />
        </span>
      ))}
    </span>
  );
}

/**
 * The pair as one compact object, for rows where the names carry the meaning
 * and the faces are only there to identify who. Overlapping rather than spaced,
 * so a Together entry never grows wider as partners are added.
 */
export function TogetherAvatarStack({
  people,
  size = "xs",
  tone = "light",
  /**
   * The separating ring is cut from the surface behind the stack, so callers
   * on white paper have to say so -- a plum ring on a white card reads as a
   * halo rather than as one face in front of another.
   */
  ring = "ring-plum-50",
  className,
}: {
  people: TogetherPerson[];
  size?: TogetherMarkSize;
  tone?: TogetherMarkTone;
  ring?: string;
  className?: string;
}) {
  if (people.length === 0) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {people.slice(0, 3).map((person, index) => (
        <TogetherAvatar
          key={`${person.displayName}-${index}`}
          person={person}
          size={size}
          tone={tone}
          className={index > 0 ? cn("-ml-2 ring-2", ring) : undefined}
        />
      ))}
    </span>
  );
}

/**
 * The empty seat.
 *
 * Used only while an invitation is out. A dashed ring rather than a filled
 * avatar: the shape says a person is expected and has not arrived, which no
 * spinner can say, because nothing here is loading.
 */
export function TogetherAwaitingMark({
  size = "md",
  tone = "light",
  className,
}: {
  size?: TogetherMarkSize;
  tone?: TogetherMarkTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid="together-awaiting-mark"
      className={cn(
        "fiyu-together-await flex shrink-0 items-center justify-center rounded-full border border-dashed font-display leading-none",
        AVATAR_SIZES[size],
        tone === "deep" ? "border-white/40 text-white" : "border-plum-500/60 text-plum-500",
        className,
      )}
    >
      ?
    </span>
  );
}
