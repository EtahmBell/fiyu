import { EditorialPlate } from "@/components/landing-page/EditorialPlate";
import {
  scoreMarkValue,
  type FictionalRestaurant,
} from "@/components/landing-page/fictionalRestaurantExamples";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { formatFiyuScore, scoreAccessibleLabel } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

/**
 * A Fiyu pick, drawn for the landing page.
 *
 * Not the application's `CompactRestaurantCard`: that card is a client component
 * wired to photo fetching, save mutations, double-tap navigation and expandable
 * copy, and pulling it onto a marketing page would drag all of that -- plus a
 * billed Google photo request per card -- along with it.
 *
 * What it does share is everything visible. Same white surface and hairline, same
 * lavender top rule, same display face for the name with a second line beneath,
 * and the real `ScoreMark` and `TagList` components, so a visitor who signs up
 * meets the surface they were shown. The card's anatomy is the app's; only its
 * behaviour is absent, because here there is nothing to behave.
 *
 * The restaurants are invented. Every composition that uses this card carries an
 * `IllustrativeNote` nearby, because a card that looks like the product and
 * carries a score has to say whose score it is.
 */

export type PickTone = "current" | "saved";

/**
 * How much of the card to draw.
 *
 * `sm-up` folds the image and the tags away below the `sm` breakpoint, leaving
 * the name, the score and the area. Three full cards side by side do not fit a
 * phone; three compact ones do, and the compact form is still recognisably the
 * same card rather than a second design.
 */
export type PickDetail = "always" | "sm-up";

/**
 * The quiet credit that has to travel with invented restaurants.
 *
 * Deliberately not a disclaimer banner: a tracked micro-caps line in the neutral
 * ink tone, set like an editorial credit. It is honest without being loud, and it
 * uses neutral rather than champagne so that introducing brass as a section
 * identity elsewhere on the page stays meaningful.
 */
export function IllustrativeNote({
  children = "Illustrative examples",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      data-testid="illustrative-note"
      className={cn(
        "flex items-center gap-2.5 text-[0.6875rem] tracking-[0.14em] text-ink-faint uppercase",
        className,
      )}
    >
      <span aria-hidden="true" className="h-px w-5 shrink-0 bg-line-strong" />
      {children}
    </p>
  );
}

function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[1.125rem]"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75v15l-5-3.25-5 3.25v-15Z" />
    </svg>
  );
}

const SURFACE = "relative min-w-0 overflow-hidden rounded-card border border-line bg-surface";

/** Japanese names get the language tag; Latin ones must not. */
function nameLang(example: FictionalRestaurant): "ja" | undefined {
  return example.romanized === null ? undefined : "ja";
}

/** The full pick: plate, name, score, category and tags. */
export function ExamplePickCard({
  example,
  tone = "current",
  detail = "always",
  className,
}: {
  example: FictionalRestaurant;
  tone?: PickTone;
  detail?: PickDetail;
  className?: string;
}) {
  const saved = tone === "saved";
  return (
    <div
      data-testid="example-pick-card"
      data-tone={tone}
      className={cn(
        SURFACE,
        "p-2.5 shadow-[0_10px_30px_-24px_rgba(49,40,61,0.5)] sm:p-3",
        "transition-colors duration-500 ease-(--ease-fiyu)",
        saved ? "border-t-gold/60" : "border-t-lavender-500/45",
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pt-0.5">
          <p
            lang={nameLang(example)}
            className="line-clamp-2 font-display text-[1.0625rem] leading-tight break-words text-ink sm:text-lg"
          >
            {example.name}
          </p>
          <p className="mt-1 line-clamp-1 text-[0.6875rem] leading-snug text-ink-muted sm:text-xs">
            {example.romanized ?? example.city}
          </p>
        </div>
        <ScoreMark
          score={scoreMarkValue(example.displayScore)}
          size="sm"
          tone={saved ? "history" : "current"}
        />
      </div>

      <div
        className={cn(
          "mt-2 min-w-0 gap-2.5",
          detail === "always"
            ? "grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[6.5rem_minmax(0,1fr)]"
            : "hidden sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)]",
        )}
      >
        {/* An illustrated plate, never a photograph: there is no restaurant to
            photograph, and a stock image here would be the dishonest option. */}
        <div className="relative h-[3.75rem] overflow-hidden rounded-lg sm:h-[4.5rem]">
          <EditorialPlate plate={example.plate} />
        </div>
        <div className="min-w-0">
          <p className="line-clamp-2 text-[0.6875rem] text-ink-muted sm:text-xs">
            {example.category}
          </p>
          <TagList tags={[...example.tags]} max={2} className="mt-1.5 hidden sm:flex" />
        </div>
      </div>

      <CardFooter example={example} saved={saved} />
    </div>
  );
}

/**
 * The footer carries the card's tense.
 *
 * A saved place swaps its area for the word, because champagne is never the only
 * signal that something has moved into the past -- and because swapping one line
 * for another keeps the card exactly as tall either way.
 */
function CardFooter({ example, saved }: { example: FictionalRestaurant; saved: boolean }) {
  return (
    <div className="mt-2 flex min-w-0 items-center justify-between gap-3 border-t border-line pt-1.5">
      <p
        className={cn(
          "min-w-0 truncate text-[0.625rem] tracking-[0.12em] uppercase",
          "transition-colors duration-500 ease-(--ease-fiyu)",
          saved ? "font-medium text-gold-700" : "text-ink-faint",
        )}
      >
        {saved ? "Discovered" : example.area}
      </p>
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 transition-colors duration-500 ease-(--ease-fiyu)",
          saved ? "text-gold-700" : "text-ink-faint",
        )}
      >
        <BookmarkGlyph filled={saved} />
      </span>
    </div>
  );
}

/** The same card with the plate dropped, for a partly occluded layer. */
export function ExamplePickCardBrief({
  example,
  tone = "current",
  className,
}: {
  example: FictionalRestaurant;
  tone?: PickTone;
  className?: string;
}) {
  const saved = tone === "saved";
  return (
    <div
      data-testid="example-pick-card-brief"
      data-tone={tone}
      className={cn(
        SURFACE,
        "p-2 shadow-[0_10px_30px_-24px_rgba(49,40,61,0.5)] sm:p-3",
        "transition-colors duration-500 ease-(--ease-fiyu)",
        saved ? "border-t-gold/60" : "border-t-lavender-500/45",
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p
            lang={nameLang(example)}
            className="line-clamp-2 font-display text-base leading-tight break-words text-ink"
          >
            {example.name}
          </p>
          <p className="mt-1 line-clamp-1 text-[0.6875rem] text-ink-muted">
            {example.category}
          </p>
        </div>
        <ScoreMark
          score={scoreMarkValue(example.displayScore)}
          size="sm"
          tone={saved ? "history" : "current"}
        />
      </div>
      <CardFooter example={example} saved={saved} />
    </div>
  );
}

/**
 * The concealed face, as the application draws it: a pale lavender field, the
 * card's own hairline, and two centred lines of type.
 *
 * The application's face reads "Tap to reveal", because there it can be tapped.
 * Here it cannot, so it says what is true instead.
 */
export function ExampleConcealedCard({ className }: { className?: string }) {
  return (
    <div
      data-testid="example-concealed-card"
      className={cn(
        "flex min-w-0 flex-col items-center justify-center rounded-card border border-line-strong bg-lavender-50 px-5 py-7 text-center",
        "shadow-[0_10px_30px_-26px_rgba(49,40,61,0.45)]",
        className,
      )}
    >
      <span aria-hidden="true" className="font-display text-xl leading-none text-plum">
        Fiyu
      </span>
      <span className="mt-2 text-[0.625rem] font-medium tracking-[0.14em] text-lavender-700 uppercase">
        Not yet revealed
      </span>
    </div>
  );
}

/**
 * One row: the shape a place takes when only its identity matters.
 *
 * Used by the location surface, where three of these change as the starting point
 * changes.
 */
export function ExampleSelectionRow({ example }: { example: FictionalRestaurant }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line py-3.5 last:border-b-0">
      <div className="min-w-0">
        <p
          lang={nameLang(example)}
          className="truncate font-display text-[0.9375rem] leading-tight text-ink"
        >
          {example.name}
        </p>
        <p className="mt-1 truncate text-[0.625rem] tracking-[0.12em] text-ink-faint uppercase">
          {example.area}
        </p>
      </div>
      <p
        className="shrink-0 font-display text-lg leading-none tabular-nums text-plum"
        role="img"
        aria-label={scoreAccessibleLabel(scoreMarkValue(example.displayScore))}
      >
        {formatFiyuScore(scoreMarkValue(example.displayScore))}
      </p>
    </div>
  );
}
