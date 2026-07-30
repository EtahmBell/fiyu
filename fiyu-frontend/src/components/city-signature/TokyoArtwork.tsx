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

export function TokyoOdenIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <path d="M35 76 80 19" {...line} />
      <circle cx="70" cy="31" r="12" fill="var(--color-lavender-100)" {...line} />
      <path d="m55 43 15 22-27 1Z" fill="var(--color-rose-dust)" fillOpacity=".25" {...line} />
      <rect x="25" y="59" width="27" height="17" rx="6" fill="var(--color-lavender-100)" {...line} />
    </FoodCanvas>
  );
}

export function TokyoNoodleIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <path d="M28 47h64c-2 24-14 34-32 34S30 71 28 47Z" fill="var(--color-lavender-100)" {...line} />
      <path d="M24 47h72M42 58c7 6 29 6 36 0" {...line} />
      <path d="M43 35c-5-6 4-8 0-15M60 35c-5-6 4-8 0-15M77 35c-5-6 4-8 0-15" {...line} />
    </FoodCanvas>
  );
}

export function TokyoOnigiriIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <path
        d="M60 17c7 0 12 7 18 17l18 31c5 9-1 17-12 17H36c-11 0-17-8-12-17l18-31c6-10 11-17 18-17Z"
        fill="var(--color-lavender-100)"
        {...line}
      />
      <path d="M49 57h22v25H49z" fill="var(--color-plum)" stroke="var(--color-plum)" strokeWidth="3" />
      <path d="M44 41c8-4 24-4 32 0" {...line} stroke="var(--color-rose-dust)" />
    </FoodCanvas>
  );
}

export function TokyoFishIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <path
        d="M25 52c13-22 42-27 66-9l14-11-1 25 1 14-16-10C65 76 38 71 25 52Z"
        fill="var(--color-lavender-100)"
        {...line}
      />
      <circle cx="47" cy="48" r="2.5" fill="var(--color-plum)" />
      <path d="m62 43-8 18M76 42l-8 20" {...line} stroke="var(--color-rose-dust)" />
    </FoodCanvas>
  );
}

export function TokyoMochiIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <FoodCanvas {...props}>
      <ellipse cx="42" cy="62" rx="22" ry="16" fill="var(--color-lavender-100)" {...line} />
      <ellipse cx="77" cy="60" rx="23" ry="18" fill="var(--color-rose-dust)" fillOpacity=".25" {...line} />
      <ellipse cx="60" cy="42" rx="22" ry="17" fill="var(--color-lavender-100)" {...line} />
      <path d="M34 82h53" {...line} />
    </FoodCanvas>
  );
}

function PatternCanvas({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 176" preserveAspectRatio="none" {...props}>
      {children}
    </svg>
  );
}

export function TokyoNorenPatternPanels(props: SVGProps<SVGSVGElement>) {
  return (
    <PatternCanvas {...props}>
      <path d="M40 20h280v112H40z" fill="var(--color-lavender-100)" fillOpacity=".55" />
      <path d="M40 20h280M110 20v110M180 20v82M250 20v110M40 132h125l15-30 15 30h125" {...textileLine} />
      <TokyoKikuMark x="169" y="38" width="22" height="22" className="text-lavender-700" />
    </PatternCanvas>
  );
}

export function TokyoNorenPatternSeams(props: SVGProps<SVGSVGElement>) {
  return (
    <PatternCanvas {...props}>
      <path d="M48 18h264v116H48z" fill="var(--color-rose-dust)" fillOpacity=".12" />
      <path d="M48 18h264M92 18v116M136 18v102M180 18v116M224 18v102M268 18v116" {...textileLine} />
      <path d="M48 134h88l8-14 8 14h72l8-14 8 14h72" {...textileLine} />
    </PatternCanvas>
  );
}

export function TokyoNorenPatternWave(props: SVGProps<SVGSVGElement>) {
  return (
    <PatternCanvas {...props}>
      <path d="M44 20h272v112H44z" fill="var(--color-lavender-100)" fillOpacity=".42" />
      <path d="M44 20h272M112 20v112M180 20v82M248 20v112" {...textileLine} />
      <path d="M44 123c17-13 34-13 51 0s34 13 51 0 34-13 51 0 34 13 51 0 34-13 51 0" {...textileLine} />
      <path d="M44 134c17-13 34-13 51 0s34 13 51 0 34-13 51 0 34 13 51 0 34-13 51 0" {...textileLine} opacity=".55" />
    </PatternCanvas>
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
