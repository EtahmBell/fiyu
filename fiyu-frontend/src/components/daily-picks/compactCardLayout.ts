/**
 * The compact card's internal layout.
 *
 * Only classes that decide a box's size live here -- padding, type size,
 * line-height, min-heights, gaps and clamps. The reveal primitive owns the
 * stable outer frame; these values keep the restaurant face compact and
 * usable inside it.
 */
export const CARD_LAYOUT = {
  main: "min-w-0",
  frame:
    "relative flex min-w-0 w-full flex-col overflow-hidden rounded-card border px-4 pt-[1.1875rem] pb-1 lg:px-5 lg:pt-[1.4375rem] lg:pb-2",
  header: "flex min-w-0 items-start justify-between gap-3",
  titleBlock: "min-w-0 flex-1 pt-0.5",
  title:
    "line-clamp-2 break-words font-display text-[1.375rem] leading-[1.15] lg:text-[1.5rem]",
  secondary: "mt-0.5 line-clamp-1 break-words text-[0.8125rem] leading-5",
  score: "mt-0.5",
  body: "mt-2.5 min-w-0",
  bodyGrid: "grid grid-cols-[6.75rem_minmax(0,1fr)] gap-3 lg:grid-cols-[34%_minmax(0,1fr)] lg:gap-4",
  photo: "h-24 min-w-0 lg:h-28",
  textColumn: "flex min-w-0 flex-col",
  textColumnResting: "min-h-24 lg:min-h-28",
  description: "text-[0.90625rem] leading-[1.375rem]",
  /** Three clamped lines of `description`: the resting copy's tallest state. */
  descriptionClampHeight: "h-[4.125rem]",
  /*
   * Three lines of copy (66px) plus this row (2 + 28px) is exactly the photo's
   * 96px, so on a phone the body is the photo's height whatever the copy is.
   */
  bodyRow:
    "mt-auto flex min-w-0 flex-row-reverse flex-wrap items-center justify-between gap-x-2 pt-0.5",
  readMore:
    "-mr-1 inline-flex min-h-7 shrink-0 items-center px-1 text-[0.8125rem] font-medium",
  price: "mr-auto shrink-0 py-1 text-[0.8125rem] leading-5 font-medium whitespace-nowrap tabular-nums",
  tags: "mt-3 hidden overflow-hidden lg:flex lg:flex-nowrap [&>li]:shrink-0 [&_*]:whitespace-nowrap",
  footer: "relative z-10 mt-auto min-w-0 pt-2",
  actionRow: "flex min-w-0 items-center gap-2 border-t pt-1",
  viewAction: "min-h-12",
  saveAction: "size-11 shrink-0",
  utilityRow: "flex min-w-0 flex-wrap items-center gap-x-3 min-[22.5rem]:flex-nowrap",
  why: "-ml-2 inline-flex min-h-10 shrink-0 items-center gap-1 px-2 text-[0.8125rem] font-medium whitespace-nowrap",
} as const;

/**
 * Collapsed reveal fronts reserve their footer before laying out variable
 * copy. An explicit Read more releases the front to natural height; no inner
 * region scrolls independently of the card.
 */
export const REVEAL_CARD_LAYOUT = {
  frame:
    "relative grid size-full min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-card border px-4 pt-3.5 pb-1",
  frameExpanded: "h-auto! min-h-full grid-rows-[auto_auto] overflow-visible",
  main: "grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]",
  mainExpanded: "grid-rows-[auto_auto]",
  header: "flex min-w-0 items-start justify-between gap-2.5",
  titleBlock: "min-w-0 flex-1",
  title: "line-clamp-2 break-words font-display text-xl leading-[1.4rem]!",
  secondary: "line-clamp-1 break-words text-[0.8125rem] leading-[1.125rem]",
  score: "mt-0",
  body: "mt-1 min-h-0 min-w-0",
  bodyGrid: "grid grid-cols-[5.625rem_minmax(0,1fr)] gap-3 overflow-hidden",
  bodyExpanded: "overflow-visible py-1",
  photo: "h-[5.625rem] min-w-0",
  textColumn: "flex min-h-0 min-w-0 flex-col",
  textColumnResting: "h-[5.625rem]",
  description: "text-sm leading-[1.125rem]",
  descriptionClampHeight: "h-9",
  bodyRow:
    "mt-auto flex min-w-0 flex-row-reverse flex-nowrap items-center justify-between gap-x-2",
  readMore:
    "-mr-1 inline-flex min-h-5 shrink-0 items-center px-1 text-[0.8125rem] font-medium",
  price:
    "mr-auto shrink-0 text-[0.8125rem] leading-5 font-medium whitespace-nowrap tabular-nums",
  tags: "hidden",
  footer: "relative z-10 min-w-0 self-end pt-1",
  actionRow: "flex min-h-10 min-w-0 items-center gap-2 border-t",
  viewAction: "min-h-10",
  saveAction: "size-10 shrink-0",
  utilityRow: "flex min-h-10 min-w-0 flex-nowrap items-center gap-x-1",
  why: "-ml-1.5 inline-flex min-h-10 shrink-0 items-center gap-0.5 px-1.5 text-xs font-medium whitespace-nowrap",
} as const;
