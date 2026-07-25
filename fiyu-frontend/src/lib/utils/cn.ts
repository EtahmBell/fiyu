export type ClassValue = string | false | null | undefined;

/**
 * Join conditional class names.
 *
 * Deliberately not tailwind-merge: this component system controls its own
 * class strings and resolves variants with explicit lookup maps rather than by
 * overriding earlier utilities, so conflict resolution is not needed.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
