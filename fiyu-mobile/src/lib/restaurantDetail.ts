import { FiyuApiError } from "@fiyu/contracts";

export function restaurantDetailErrorCopy(error: unknown): { title: string; body: string; retryable: boolean } {
  if (error instanceof FiyuApiError && error.kind === "not-found") {
    return { title: "Restaurant not found", body: "It may no longer be available in Fiyu.", retryable: false };
  }
  if (error instanceof FiyuApiError && error.kind === "invalid-response") {
    return { title: "Restaurant details could not be read", body: "Check your connection and try again.", retryable: true };
  }
  return { title: "Restaurant could not be loaded", body: "Check your connection and try again.", retryable: true };
}
