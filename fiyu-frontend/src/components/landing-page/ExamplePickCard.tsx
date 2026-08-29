import { EditorialPlate } from "@/components/landing-page/EditorialPlate";
import type { LandingExample } from "@/components/landing-page/landingExamples";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { formatFiyuScore, scoreAccessibleLabel } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

/**
 * A Fiyu pick, drawn for the landing page.
 *
 * Not the application's `CompactRestaurantCard`: that card is a client
 * component wired to photo fetching, save mutations, double-tap navigation and
 * expandable copy, and pulling it onto a marketing page would drag all of that
 * -- plus a billed Google photo request per card -- along with it.
 *
 * What it does share is everything visible. Same white surface and hairline,
 * same lavender top rule, same display face for the Japanese name with the
 * English name beneath, and the real `ScoreMark` and `TagList` components, so a
 * visitor who signs up meets the surface they were shown. The card's anatomy is
 * the app's; only its behaviour is absent, because here there is nothing to
 * behave.
 */

export type PickTone = "current" | "saved";

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

const SURFACE =
  "relative min-w-0 overflow-hidden rounded-card border border-line bg-surface";

/**
 * How much of the card to draw.
 *
 * `sm-up` folds the image and the tags away below the `sm` breakpoint, leaving
 * the names, the score and the area. Three full cards side by side do not fit a
 * phone; three compact ones do, and the compact form is still recognisably the
 * same card rather than a second design.
 */
export type PickDetail = "always" | "sm-up";

/** The full pick: plate, both names, score, a signature dish and tags. */
export function ExamplePickCard({
  example,
  tone = "current",
  detail = "always",
  className,
}: {
  example: LandingExample;
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
        saved ? "border-t-gold/60" : "border-t-lavender-500/45",
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pt-0.5">
          <p
            lang="ja"
            className="line-clamp-2 font-display text-[1.0625rem] leading-tight break-words text-ink sm:text-lg"
          >
            {example.nameJa}
          </p>
          <p className="mt-1 line-clamp-1 text-[0.6875rem] leading-snug text-ink-muted sm:text-xs">
            {example.nameEn}
          </p>
        </div>
        <ScoreMark
          score={example.score}
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
        <div className="relative h-[3.75rem] overflow-hidden rounded-lg sm:h-[4.5rem]">
          {example.photo ? (
            // A plain <img>: these are static marketing assets, and the card is
            // small enough that Next's optimizer buys nothing at this size.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={example.photo}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover object-center"
            />
          ) : (
            <EditorialPlate plate={example.plate} />
          )}
        </div>
        <div className="min-w-0">
          <p className="line-clamp-1 text-[0.6875rem] text-ink-muted sm:text-xs">
            {example.category}
          </p>
          {example.signature && (
            <p lang="ja" className="mt-1 line-clamp-1 text-xs text-ink/75 sm:text-[0.8125rem]">
              {example.signature}
            </p>
          )}
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
 * A saved place swaps its neighbourhood for the word, because champagne is
 * never the only signal that something has moved into the past -- and because
 * swapping one line for another keeps the card exactly as tall either way,
 * which is what lets the pinned surface change state without shifting the
 * page under a reader who is scrolling it.
 */
function CardFooter({ example, saved }: { example: LandingExample; saved: boolean }) {
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
  example: LandingExample;
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
        "p-2.5 shadow-[0_10px_30px_-24px_rgba(49,40,61,0.5)] sm:p-3",
        "transition-colors duration-500 ease-(--ease-fiyu)",
        saved ? "border-t-gold/60" : "border-t-lavender-500/45",
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p
            lang="ja"
            className="line-clamp-2 font-display text-base leading-tight break-words text-ink"
          >
            {example.nameJa}
          </p>
          <p className="mt-1 line-clamp-1 text-[0.6875rem] text-ink-muted">{example.nameEn}</p>
        </div>
        <ScoreMark score={example.score} size="sm" tone={saved ? "history" : "current"} />
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
 * changes. It previously carried a `shared` flag that tinted and labelled a
 * restaurant appearing in two of three hypothetical selections; that section is
 * gone, and so is the flag.
 */
export function ExampleSelectionRow({ example }: { example: LandingExample }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line py-3.5 last:border-b-0">
      <div className="min-w-0">
        <p lang="ja" className="truncate font-display text-[0.9375rem] leading-tight text-ink">
          {example.nameJa}
        </p>
        <p className="mt-1 truncate text-[0.625rem] tracking-[0.12em] text-ink-faint uppercase">
          {example.area}
        </p>
      </div>
      <p
        className="shrink-0 font-display text-lg leading-none tabular-nums text-plum"
        role="img"
        aria-label={scoreAccessibleLabel(example.score)}
      >
        {formatFiyuScore(example.score)}
      </p>
    </div>
  );
}
