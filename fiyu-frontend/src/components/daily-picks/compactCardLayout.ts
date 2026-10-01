/**
 * The compact card's layout, shared by the card and by its reveal sizer.
 *
 * Only classes that decide a box's size live here -- padding, type size,
 * line-height, min-heights, gaps and clamps. The sizer is built from exactly
 * these strings, so the concealed face of a Pick is always as tall as that
 * Pick's revealed face would be, and the two cannot drift apart when one of
 * them is restyled.
 */
export const CARD_LAYOUT = {
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
