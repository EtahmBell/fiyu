import { cn } from "@/lib/utils/cn";

/**
 * The illustrated stand-in that sits where a card's photograph sits.
 *
 * Fiyu has no photographic library of its own: card photos come from Google at
 * request time, each one a billed call, and a public landing page hit by
 * anonymous traffic is the worst possible place to spend them. Stock
 * photography is worse still -- a picture of a restaurant Fiyu did not
 * photograph, standing in for one it did not choose.
 *
 * So these are drawn instead, in the same 1px warm-line language as
 * `about-storefront.png`, and they are deliberately not photographic: nobody
 * can mistake a line drawing of a counter for a photograph of this restaurant.
 * Four universal restaurant scenes, no city motifs, so the set travels to New
 * York unchanged.
 *
 * Inline SVG rather than files: a few hundred bytes each, no network request,
 * no effect on LCP, and they inherit the page's own colour tokens.
 */
export type PlateId = "counter" | "bowl" | "doorway" | "hearth";

const LINE = "var(--color-line-strong)";
const INK = "var(--color-ink-faint)";
const ACCENT = "var(--color-lavender-500)";
const WARM = "var(--color-rose-dust)";

function Counter() {
  return (
    <>
      <path d="M0 74h160" stroke={LINE} />
      <path d="M18 42h124v10H18z" fill="var(--color-lavender-100)" opacity=".5" />
      <path d="M18 52h124" stroke={LINE} />
      {/* Pendant light: the one lavender mark, and the only filled shape. */}
      <path d="M80 0v16" stroke={LINE} />
      <path d="M70 30 80 16l10 14z" fill="var(--color-lavender-100)" stroke={ACCENT} />
      <path d="M24 74h112v8H24z" fill="var(--color-surface)" stroke={LINE} />
      <path d="M32 90v26M44 90v26M116 90v26M128 90v26" stroke={INK} opacity=".55" />
      <ellipse cx="38" cy="88" rx="9" ry="2.6" fill="var(--color-surface)" stroke={INK} />
      <ellipse cx="122" cy="88" rx="9" ry="2.6" fill="var(--color-surface)" stroke={INK} />
      <path d="M66 74c0-3.4 3.6-6 8-6s8 2.6 8 6" fill="none" stroke={WARM} />
      <path d="M96 68h14M96 71h14" stroke={INK} opacity=".7" />
    </>
  );
}

function Bowl() {
  return (
    <>
      <path d="M0 92h160" stroke={LINE} />
      {/* Steam: the only curved strokes, so the plate reads warm not diagrammatic. */}
      <path d="M70 44c6-7 0-13 4-19M84 40c6-8 0-14 4-20" fill="none" stroke={WARM} opacity=".8" />
      <path d="M52 62h56l-7 24a6 6 0 0 1-5.6 4H64.6a6 6 0 0 1-5.6-4z" fill="var(--color-surface)" stroke={LINE} />
      <path d="M56 68h48" stroke={ACCENT} opacity=".45" />
      <path d="M112 56 148 48" stroke={INK} />
      <path d="M112 60 148 52" stroke={INK} />
      <path d="M24 74h14v18H24z" fill="var(--color-lavender-100)" opacity=".55" />
      <path d="M24 74h14v18H24z" fill="none" stroke={LINE} />
      <path d="M31 74V60" stroke={LINE} />
      <path d="M31 60c-4-4-4-9 0-12M31 60c4-3 4-8 0-11" fill="none" stroke={WARM} opacity=".7" />
    </>
  );
}

function Doorway() {
  return (
    <>
      <path d="M0 106h160" stroke={LINE} />
      <path d="M28 14h104v92H28z" fill="var(--color-surface)" stroke={LINE} />
      <path d="M62 44h36v62H62z" fill="var(--color-lavender-100)" opacity=".6" />
      <path d="M62 44h36v62H62z" fill="none" stroke={LINE} />
      <path d="M62 58h36" stroke={ACCENT} opacity=".5" />
      {/* Lantern, lit: warm rather than lavender, because it is a signal of
          somewhere open rather than a Fiyu mark. */}
      <circle cx="45" cy="40" r="7" fill="var(--color-gold-soft)" stroke={WARM} />
      <path d="M45 26v7" stroke={LINE} />
      <path d="M108 34h18v14h-18z" fill="none" stroke={INK} opacity=".7" />
      <path d="M112 39h10M112 43h10" stroke={INK} opacity=".55" />
      <path d="M132 106V88c6 0 10 4 10 9s-4 9-10 9z" fill="var(--color-lavender-100)" opacity=".5" />
      <path d="M28 100h104" stroke={LINE} opacity=".7" />
    </>
  );
}

function Hearth() {
  return (
    <>
      <path d="M0 84h160" stroke={LINE} />
      <path d="M36 8h88v20H36z" fill="var(--color-surface)" stroke={LINE} />
      <path d="M48 28h64v6H48z" fill="var(--color-lavender-100)" opacity=".55" />
      <path d="M44 62h72v22H44z" fill="var(--color-surface)" stroke={LINE} />
      <path d="M52 68h56" stroke={INK} opacity=".5" />
      {/* Embers: three warm marks, never a glow. */}
      <path d="M60 74h4M78 74h4M96 74h4" stroke={WARM} strokeWidth="1.6" />
      <path d="M30 56h100" stroke={INK} />
      <path d="M46 52v8M64 52v8M82 52v8M100 52v8M118 52v8" stroke={ACCENT} opacity=".55" />
      <path d="M124 84V70c8 0 13 3 13 7s-5 7-13 7z" fill="var(--color-lavender-100)" opacity=".45" />
    </>
  );
}

const PLATES: Record<PlateId, () => React.ReactElement> = {
  counter: Counter,
  bowl: Bowl,
  doorway: Doorway,
  hearth: Hearth,
};

export function EditorialPlate({ plate, className }: { plate: PlateId; className?: string }) {
  const Drawing = PLATES[plate];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block size-full", className)}
    >
      <rect width="160" height="120" fill="var(--color-lavender-50)" />
      <g fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <Drawing />
      </g>
    </svg>
  );
}
