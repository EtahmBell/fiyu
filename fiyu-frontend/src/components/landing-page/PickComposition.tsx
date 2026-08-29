"use client";

import { useEffect, useState } from "react";

import {
  ExampleConcealedCard,
  ExamplePickCard,
  ExamplePickCardBrief,
} from "@/components/landing-page/ExamplePickCard";
import type { FictionalRestaurant } from "@/components/landing-page/fictionalRestaurantExamples";
import { NearbyDiscoveryPlate } from "@/components/landing-page/NearbyDiscoveryPlate";
import { usePrefersReducedMotion } from "@/components/landing-page/motion/scrollScene";
import { cn } from "@/lib/utils/cn";

/**
 * Three Fiyu picks settling onto a neighbourhood.
 *
 * The hero's composition, and now only the hero's: a plate of somewhere, a
 * revealed pick in front, a second pick uncovering itself, a third still
 * concealed. Those are the two states the application actually has, in the order
 * a reader meets them.
 *
 * It used to close the page as well. Ending on the same object the page opened
 * with meant a reader met it three times inside one visit, which is most of why
 * the imagery felt thin -- so the final section is type and a colophon now, and
 * this composition belongs to the hero alone. It runs on load, because the hero
 * is above the fold, and needs no observer.
 *
 * The stack is laid out in normal flow with negative margins and alternating
 * alignment, not by absolute percentages inside a fixed-height box. That is what
 * makes the overlap hold: the cards tuck into each other by a set number of
 * pixels whatever the column is doing, and the composition is exactly as tall as
 * its contents at every width instead of clipping on a narrow screen or opening
 * gaps on a wide one.
 *
 * The sequence runs once. After it lands the only movement left is a four to six
 * pixel drift on each card over twelve to fourteen seconds at different phases,
 * which reads as depth rather than as animation.
 *
 * Every layer owns exactly one transform: flow position, then entrance, then
 * drift, then the static rake. Stacking them is what lets an entrance animation
 * and an ambient loop coexist without either resetting the other.
 */

const REVEAL_DELAY_MS = 2400;

interface Layer {
  /** Flow placement. Alternating alignment is what gives the stack its scatter. */
  place: string;
  rake: string;
  entrance: { x: string; y: string; delay: number };
  drift: { x: string; y: string; duration: string; delay: string };
  z: string;
}

/**
 * Back to front, which is also the order they arrive in: the concealed card
 * first, the front pick last.
 */
const LAYERS: readonly [Layer, Layer, Layer] = [
  {
    place: "self-end w-[58%] sm:w-[52%]",
    rake: "rotate-[3.2deg]",
    entrance: { x: "10px", y: "-14px", delay: 90 },
    drift: { x: "-3px", y: "-6px", duration: "13s", delay: "3.1s" },
    z: "z-10",
  },
  {
    place: "-mt-5 self-start w-[72%] sm:w-[66%]",
    rake: "-rotate-[1.9deg]",
    entrance: { x: "-16px", y: "18px", delay: 250 },
    drift: { x: "3px", y: "-4px", duration: "14s", delay: "2.4s" },
    z: "z-20",
  },
  {
    place: "-mt-8 self-end w-[88%] sm:w-[84%]",
    rake: "rotate-[0.7deg]",
    entrance: { x: "14px", y: "26px", delay: 420 },
    drift: { x: "0px", y: "-5px", duration: "12s", delay: "1.6s" },
    z: "z-30",
  },
];

function Stacked({
  layer,
  started,
  children,
}: {
  layer: Layer;
  started: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative min-w-0", layer.place, layer.z)}>
      <div
        className="fiyu-lp-settle"
        data-in={started ? "true" : "false"}
        style={
          {
            "--settle-x": layer.entrance.x,
            "--settle-y": layer.entrance.y,
            "--settle-delay": layer.entrance.delay + "ms",
          } as React.CSSProperties
        }
      >
        <div
          className="fiyu-lp-drift"
          style={
            {
              "--drift-x": layer.drift.x,
              "--drift-y": layer.drift.y,
              "--drift-duration": layer.drift.duration,
              "--drift-delay": layer.drift.delay,
            } as React.CSSProperties
          }
        >
          <div className={layer.rake}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/** A live discovery marker, using the map pin sprout the application already has. */
function Pin({ className, sprout, delay }: { className: string; sprout: boolean; delay: number }) {
  return (
    <span aria-hidden="true" className={cn("absolute z-0", className)}>
      <span
        className={cn(
          "grid size-7 place-items-center rounded-full border border-lavender-500/40 bg-canvas/70",
          sprout && "fiyu-map-pin-sprout",
        )}
        style={sprout ? { animationDelay: delay + "ms" } : undefined}
      >
        <span className="size-2.5 rounded-full bg-lavender-500" />
      </span>
    </span>
  );
}

const PLATE_MASK = "radial-gradient(ellipse 74% 72% at 50% 48%, black 44%, transparent 100%)";

export function PickComposition({
  examples,
  className,
}: {
  examples: readonly FictionalRestaurant[];
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const started = true;
  const [lifted, setLifted] = useState(false);
  const [front, middle, back] = examples;

  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setLifted(true), REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  return (
    <div data-testid="pick-composition" className={cn("relative min-w-0", className)}>
      {/*
       * The plate is masked at its edges rather than framed. A border here made
       * the whole composition read as one screenshot laid on the page. It is
       * absolute, so it never contributes to the composition's height.
       */}
      <div className="pointer-events-none absolute inset-x-[-8%] inset-y-[-12%] overflow-hidden">
        <div
          className="fiyu-lp-rise size-full opacity-55"
          data-in={started ? "true" : "false"}
          style={
            {
              "--rise-from": "8px",
              "--rise-duration": "900ms",
              maskImage: PLATE_MASK,
              WebkitMaskImage: PLATE_MASK,
            } as React.CSSProperties
          }
        >
          <NearbyDiscoveryPlate />
        </div>
      </div>

      <Pin className="top-[2%] left-[2%]" sprout={started && !reduced} delay={900} />
      <Pin className="right-[2%] bottom-[6%]" sprout={started && !reduced} delay={1120} />

      <div className="relative flex flex-col">
        <Stacked layer={LAYERS[0]} started={started}>
          <ExampleConcealedCard className="h-[7.5rem] sm:h-[8.5rem]" />
        </Stacked>

        <Stacked layer={LAYERS[1]} started={started}>
          <div className="relative">
            <ExamplePickCardBrief example={middle} />
            <div
              aria-hidden="true"
              data-lifted={lifted ? "true" : "false"}
              className="fiyu-lp-veil absolute inset-0"
            >
              <ExampleConcealedCard className="size-full" />
            </div>
          </div>
        </Stacked>

        <Stacked layer={LAYERS[2]} started={started}>
          <ExamplePickCard example={front} />
        </Stacked>
      </div>

      {/* The third example belongs to the composition even though its card stays
          concealed, so it is named for assistive tech. Invented restaurants, and
          the caption beside the composition says so. */}
      <p className="sr-only">
        Illustrative Fiyu discoveries in Tokyo: {front.romanized ?? front.name},{" "}
        {middle.romanized ?? middle.name}, and {back.romanized ?? back.name}.
      </p>
    </div>
  );
}
