/** Shared API error semantics, with the browser-only online check kept here. */
export {
  FiyuApiError,
  extractDetail,
  isFiyuApiError,
  kindForStatus,
  type FiyuApiErrorOptions,
  type FiyuErrorKind,
} from "@fiyu/contracts/errors";

import type { FiyuErrorKind } from "@fiyu/contracts/errors";

export function kindForNetworkFailure(): FiyuErrorKind {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  return "network";
}
