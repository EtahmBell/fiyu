"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { compactCardContent } from "@/components/daily-picks/CompactRestaurantCard";
import { CARD_LAYOUT } from "@/components/daily-picks/compactCardLayout";
import { OutboundMapActions } from "@/components/restaurant/OutboundMapActions";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { outboundMapLinks } from "@/lib/outbound/mapLinks";
import { cn } from "@/lib/utils/cn";

let sharedContext: OffscreenCanvasRenderingContext2D | null | undefined;

/** A text-measuring context that never touches the DOM, or null where unsupported. */
function measuringContext(): OffscreenCanvasRenderingContext2D | null {
  if (sharedContext !== undefined) return sharedContext;
  sharedContext =
    typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1).getContext("2d");
  return sharedContext;
}

function computedFont(element: Element): string {
  const style = getComputedStyle(element);
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

/*
 * Measurement is deliberately pessimistic. Canvas cannot apply `palt` or
 * tabular figures, and web fonts may still be settling, so a title only counts
 * as one line with room to spare and a price is padded. Erring tall costs a
 * few pixels of paper; erring short would move the Picks below on reveal.
 */
const TITLE_FIT = 0.95;
const PRICE_PADDING = 1.08;

export interface CompactCardSizerProps {
  restaurant: PublicRestaurant;
  hasDetails: boolean;
}

/**
 * The revealed card's footprint, with none of its content.
 *
 * Rendered invisibly in the same grid cell as both faces of a Pick, so the
 * concealed face is exactly as tall as this Pick will be once revealed -- and
 * stays that tall afterwards -- without anything identifying entering the DOM
 * before the reveal succeeds. Every box comes from CARD_LAYOUT, the card's own
 * geometry. The only content-dependent measurements (does the name fit on one
 * line; how wide is the price) are taken on an OffscreenCanvas and applied as
 * sizes, never as text.
 *
 * Its three clamped copy lines and its Read more slot are upper bounds: a card
 * with shorter copy simply rests inside the footprint.
 */
export function CompactCardSizer({ restaurant, hasDetails }: CompactCardSizerProps) {
  const { title, titleLang, secondaryLine, description, tags, budget } =
    compactCardContent(restaurant);
  const hasMapLinks = outboundMapLinks(restaurant).length > 0;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const priceRef = useRef<HTMLSpanElement>(null);
  // Until measured, assume the tallest title so a reveal can never grow.
  const [titleLines, setTitleLines] = useState<1 | 2>(2);
  const [priceWidth, setPriceWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const titleSlot = titleRef.current;
    if (!titleSlot) return;
    const measure = () => {
      const context = measuringContext();
      if (!context || titleSlot.clientWidth === 0) return;
      context.font = computedFont(titleSlot);
      setTitleLines(
        context.measureText(title).width <= titleSlot.clientWidth * TITLE_FIT ? 1 : 2,
      );
      const priceSlot = priceRef.current;
      if (budget && priceSlot) {
        context.font = computedFont(priceSlot);
        setPriceWidth(Math.ceil(context.measureText(budget).width * PRICE_PADDING) + 2);
      }
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(titleSlot);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void fonts?.ready.then(measure);
    fonts?.addEventListener?.("loadingdone", measure);
    return () => {
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", measure);
    };
  }, [title, budget]);

  return (
    <div data-testid="compact-card-sizer" className={cn(CARD_LAYOUT.frame, "border-transparent")}>
      <div className={CARD_LAYOUT.header}>
        <div className={CARD_LAYOUT.titleBlock}>
          {/*
            An h3, like the card's own title, so element-scoped rules (the
            taller Japanese leading in globals.css) apply to both. The whole
            sizer is aria-hidden, so this never reaches the accessibility tree.
          */}
          <h3 ref={titleRef} lang={titleLang} className={CARD_LAYOUT.title}>
            {"\u00a0"}
            {titleLines === 2 && (
              <>
                <br />
                {"\u00a0"}
              </>
            )}
          </h3>
          {secondaryLine && <div className={CARD_LAYOUT.secondary}>{"\u00a0"}</div>}
        </div>
        <ScoreMark score={null} size="card" decorative className={CARD_LAYOUT.score} />
      </div>

      <div className={cn(CARD_LAYOUT.body, CARD_LAYOUT.bodyGrid)}>
        <div className={cn(CARD_LAYOUT.photo, "w-full")} />
        <div className={cn(CARD_LAYOUT.textColumn, CARD_LAYOUT.textColumnResting)}>
          {description && <div className={CARD_LAYOUT.descriptionClampHeight} />}
          {(description || budget) && (
            <div className={CARD_LAYOUT.bodyRow}>
              {description && (
                <span className={CARD_LAYOUT.readMore}>
                  <span className="before:content-['Read_more']" />
                </span>
              )}
              {budget && (
                <span
                  ref={priceRef}
                  className={cn(CARD_LAYOUT.price, "inline-block")}
                  style={{ width: priceWidth ?? "8.5rem" }}
                >
                  {/* A line box, so the slot is the price's height and not just its padding. */}
                  {"\u00a0"}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {tags.length > 0 && (
        // The card's own TagList, with one blank chip: the row is a single line.
        <TagList tags={["\u00a0"]} className={CARD_LAYOUT.tags} />
      )}

      <div className={CARD_LAYOUT.footer}>
        <div className={cn(CARD_LAYOUT.actionRow, "border-transparent")}>
          {hasDetails && <div className={CARD_LAYOUT.viewAction} />}
          <div className={cn(CARD_LAYOUT.saveAction, "ml-auto")} />
        </div>
        <div className={CARD_LAYOUT.utilityRow}>
          {hasDetails && (
            <span className={CARD_LAYOUT.why}>
              <span className="before:content-['Why_Fiyu_found_it']" />
              <span className="size-3 shrink-0" />
            </span>
          )}
          {hasMapLinks && (
            <OutboundMapActions restaurant={restaurant} variant="footer" placeholder className="ml-auto" />
          )}
        </div>
      </div>
    </div>
  );
}
