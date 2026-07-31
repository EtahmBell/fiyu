/**
 * Compile-time development gate for unlimited local Picks testing.
 *
 * The public flag is intentionally insufficient on its own: a production
 * bundle must never expose the testing controls, even when the build
 * environment happens to contain a stale flag value.
 */
export const UNLIMITED_PICKS_DEV_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_FIYU_DEV_MODE === "true";
