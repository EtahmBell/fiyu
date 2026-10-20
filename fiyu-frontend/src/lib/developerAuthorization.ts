import type { DeveloperStatus } from "@/lib/api/schemas";

export function isDeveloperAuthorized(
  status: DeveloperStatus | null | undefined,
): status is DeveloperStatus {
  return status?.enabled === true && status.authorized === true;
}
