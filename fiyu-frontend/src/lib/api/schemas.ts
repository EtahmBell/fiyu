/**
 * Compatibility export for the existing Next application.
 *
 * Runtime contracts live in @fiyu/contracts so web and native validate the
 * same backend payloads. Keep application imports pointed at this module while
 * the migration remains incremental.
 */
export * from "@fiyu/contracts/schemas";
