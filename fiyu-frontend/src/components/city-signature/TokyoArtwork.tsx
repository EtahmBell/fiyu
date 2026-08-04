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

export function TokyoSakuraMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="
          M12 11.2
          C10.8 9.8 9.2 8.4 9.2 6.2
          C9.2 4.2 10.5 2.6 12 1.7
          C13.5 2.6 14.8 4.2 14.8 6.2
          C14.8 8.4 13.2 9.8 12 11.2

          M12.8 11.6
          C14.3 10.8 16.2 9.8 18.3 10.5
          C20.2 11.1 21.3 12.8 21.6 14.5
          C20.3 15.7 18.4 16.4 16.5 15.8
          C14.5 15.2 13.5 13.4 12.8 11.6

          M11.2 11.6
          C9.7 10.8 7.8 9.8 5.7 10.5
          C3.8 11.1 2.7 12.8 2.4 14.5
          C3.7 15.7 5.6 16.4 7.5 15.8
          C9.5 15.2 10.5 13.4 11.2 11.6

          M11.3 12.4
          C10.4 14 9.4 15.9 10.1 18
          C10.7 19.9 12.3 21 14 21.4
          C15.2 20.1 15.9 18.2 15.3 16.3
          C14.7 14.4 13 13.3 11.3 12.4

          M12.7 12.4
          C13.6 14 14.6 15.9 13.9 18
          C13.3 19.9 11.7 21 10 21.4
          C8.8 20.1 8.1 18.2 8.7 16.3
          C9.3 14.4 11 13.3 12.7 12.4
        "
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="12" cy="12" r="1.1" fill="currentColor" />

      <path
        d="M12 10.2V8.9
           M13.1 10.7L14 9.8
           M13.4 12H14.7
           M10.9 10.7L10 9.8
           M10.6 12H9.3"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />

      <circle cx="12" cy="8.7" r="0.55" fill="currentColor" />
      <circle cx="14.2" cy="9.6" r="0.55" fill="currentColor" />
      <circle cx="14.9" cy="12" r="0.55" fill="currentColor" />
      <circle cx="9.8" cy="9.6" r="0.55" fill="currentColor" />
      <circle cx="9.1" cy="12" r="0.55" fill="currentColor" />
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
    <svg aria-hidden="true" viewBox="0 0 160 120" {...props}>
      <path d="M20 96h120" fill="none" stroke="var(--color-plum)" strokeWidth="2.25" strokeLinecap="round" />

      <path d="M24 96V70h16v26M40 96V62h20v34M60 96V74h14v22" fill="var(--color-lavender-100)" fillOpacity="0.3" />
      <path d="M24 96V70h16v26M40 96V62h20v34M60 96V74h14v22" fill="none" stroke="var(--color-plum)" strokeWidth="2" strokeLinejoin="round" />

      <path d="M78 96V64h14v32M92 96V58h18v38M110 96V68h12v28M122 96V72h14v24" fill="var(--color-lavender-100)" fillOpacity="0.24" />
      <path d="M78 96V64h14v32M92 96V58h18v38M110 96V68h12v28M122 96V72h14v24" fill="none" stroke="var(--color-plum)" strokeWidth="2" strokeLinejoin="round" />

      <path d="M46 62h8M96 58h7M126 72h5" fill="none" stroke="var(--color-plum)" strokeWidth="1.5" strokeLinecap="round" opacity="0.62" />
      <path d="M82 74h5M82 82h5M98 68h6M98 76h6" fill="none" stroke="var(--color-plum)" strokeWidth="1.25" strokeLinecap="round" opacity="0.4" />

      <path d="M74 96V78" fill="none" stroke="var(--color-plum)" strokeWidth="2" />
      <path d="M74 78 69 94h10Z" fill="var(--color-lavender-100)" fillOpacity="0.34" stroke="var(--color-plum)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M74 70 70.5 78h7Z" fill="none" stroke="var(--color-plum)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M70.5 86h7" fill="none" stroke="var(--color-plum)" strokeWidth="1.25" strokeLinecap="round" opacity="0.72" />
    </svg>
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
