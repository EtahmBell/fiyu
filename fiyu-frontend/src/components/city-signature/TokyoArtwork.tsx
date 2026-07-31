import type { SVGProps } from "react";

const line = {
  stroke: "var(--color-plum)",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const textileLine = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * Shared line treatment for the five loading illustrations.
 *
 * `fill: "none"` is the load-bearing part. The older `line` constant omits it,
 * so every open path drawn with it inherited the SVG default of solid black --
 * the steam wisps and the broth curve in the bowl, and the arc on the onigiri,
 * all rendered as filled blobs rather than strokes.
 *
 * Spread this FIRST and put an explicit `fill` after it on the shapes that want
 * one; spreading it last would overwrite their fill with `none`.
 */
const foodLine = {
  fill: "none",
  stroke: "var(--color-plum)",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Custom seven-petal floral mark; intentionally unlike the Imperial crest. */
export function TokyoKikuMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
      <g fill="var(--color-lavender-100)" stroke="currentColor" strokeWidth="1.25">
        {[0, 51.43, 102.86, 154.29, 205.71, 257.14, 308.57].map((angle) => (
          <ellipse
            key={angle}
            cx="12"
            cy="6.6"
            rx="2.35"
            ry="4.25"
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="2.5" fill="var(--color-rose-dust)" />
      </g>
    </svg>
  );
}

function FoodCanvas({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 96" {...props}>
      {children}
    </svg>
  );
}

/**
 * A skewer threaded with a circle, a triangle and a rounded rectangle.
 *
 * The pieces are laid out on a vertical axis and the whole group is rotated
 * once, so every piece is genuinely centred on the skewer. The previous version
 * hand-placed each piece near a diagonal line, which left the triangle hanging
 * off the axis and the rounded rectangle overhanging the end of the stick.
 * Rotating a group also keeps stroke weight uniform, since no scaling occurs.
 */
export function TokyoOdenIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <g transform="rotate(38 60 50)">
        <path d="M60 90V6" {...foodLine} />
        <circle cx="60" cy="26" r="11" {...foodLine} fill="var(--color-lavender-100)" />
        <path
          d="m60 40 12 20H48Z"
          {...foodLine}
          fill="var(--color-rose-dust)"
          fillOpacity=".3"
        />
        <rect
          x="46"
          y="62"
          width="28"
          height="16"
          rx="7"
          {...foodLine}
          fill="var(--color-lavender-100)"
        />
      </g>
    </FoodCanvas>
  );
}

export function TokyoNoodleIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <path
        d="M28 47h64c-2 24-14 34-32 34S30 71 28 47Z"
        {...foodLine}
        fill="var(--color-lavender-100)"
      />
      <path d="M24 47h72M42 58c7 6 29 6 36 0" {...foodLine} />
      <path d="M43 35c-5-6 4-8 0-15M60 35c-5-6 4-8 0-15M77 35c-5-6 4-8 0-15" {...foodLine} />
    </FoodCanvas>
  );
}

export function TokyoFishIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <path
        d="M25 52c13-22 42-27 66-9l14-11-1 25 1 14-16-10C65 76 38 71 25 52Z"
        {...foodLine}
        fill="var(--color-lavender-100)"
      />
      <circle cx="47" cy="48" r="2.5" fill="var(--color-plum)" />
      <path d="m62 43-8 18M76 42l-8 20" {...foodLine} stroke="var(--color-rose-dust)" />
    </FoodCanvas>
  );
}

export function TokyoOnigiriIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <path
        d="M60 17c7 0 12 7 18 17l18 31c5 9-1 17-12 17H36c-11 0-17-8-12-17l18-31c6-10 11-17 18-17Z"
        {...foodLine}
        fill="var(--color-lavender-100)"
      />
      <path d="M49 57h22v25H49z" {...foodLine} fill="var(--color-plum)" />
      <path d="M44 41c8-4 24-4 32 0" {...foodLine} stroke="var(--color-rose-dust)" />
    </FoodCanvas>
  );
}

export function TokyoMochiIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <ellipse cx="42" cy="62" rx="22" ry="16" {...foodLine} fill="var(--color-lavender-100)" />
      <ellipse
        cx="77"
        cy="60"
        rx="23"
        ry="18"
        {...foodLine}
        fill="var(--color-rose-dust)"
        fillOpacity=".28"
      />
      <ellipse cx="60" cy="42" rx="22" ry="17" {...foodLine} fill="var(--color-lavender-100)" />
      <path d="M34 82h53" {...foodLine} />
    </FoodCanvas>
  );
}

export function TokyoPicksWatermark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 240 200" {...props}>
      <path d="M28 20h184v140H28z" fill="var(--color-lavender-100)" />
      <path d="M28 20h184M74 20v140M120 20v104M166 20v140M28 160h76l16-36 16 36h76" {...textileLine} />
      <TokyoKikuMark x="106" y="52" width="28" height="28" className="text-plum" />
    </svg>
  );
}

function EmptyNorenCanvas({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 120" {...props}>
      <path d="M25 20h110v73H25z" fill="var(--color-lavender-100)" />
      <path d="M25 20h110M52.5 20v73M80 20v54M107.5 20v73M25 93h44l11-19 11 19h44M18 101h124" {...line} strokeWidth="2.25" />
      {children}
    </svg>
  );
}

export function TokyoSavedEmptyIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <EmptyNorenCanvas {...props}>
      <TokyoKikuMark x="68" y="32" width="24" height="24" className="text-lavender-700" />
    </EmptyNorenCanvas>
  );
}

export function TokyoDiscoveriesEmptyIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <EmptyNorenCanvas {...props}>
      <ellipse cx="80" cy="94" rx="19" ry="5" fill="var(--color-rose-dust)" fillOpacity=".35" stroke="var(--color-plum)" strokeWidth="2" />
      <path d="m119 45 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="var(--color-lavender-500)" />
    </EmptyNorenCanvas>
  );
}

export function TokyoVisitsEmptyIllustration(props: SVGProps<SVGSVGElement>) {
  return <EmptyNorenCanvas data-visits-empty-illustration="plain-noren" {...props} />;
}

export function TokyoListsEmptyIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <EmptyNorenCanvas {...props}>
      <path d="M44 40h17v33H44zM71 35h18v38H71zM99 43h17v30H99z" fill="var(--color-rose-dust)" fillOpacity=".22" stroke="var(--color-plum)" strokeWidth="2" />
    </EmptyNorenCanvas>
  );
}
