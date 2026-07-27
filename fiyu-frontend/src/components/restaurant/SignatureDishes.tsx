import { detectTextLang } from "@/lib/format/language";
import { cn } from "@/lib/utils/cn";

export interface SignatureDishesProps {
  dishes: string[];
  max?: number;
  className?: string;
}

/**
 * Signature dishes, rendered exactly as the API returns them.
 *
 * Deliberately the quietest content on the card: small, faint, set as a single
 * run of prose rather than chips, so it supports the recommendation instead of
 * competing with it. "Signature" is UI copy; the dish names are API content and
 * are never translated or romanized.
 */
export function SignatureDishes({ dishes, max, className }: SignatureDishesProps) {
  if (dishes.length === 0) return null;

  const visible = max === undefined ? dishes : dishes.slice(0, max);
  const hidden = dishes.length - visible.length;

  return (
    <p className={cn("text-[0.6875rem] leading-relaxed text-ink-faint", className)}>
      <span className="tracking-[0.08em] uppercase">Signature</span>
      <span aria-hidden="true"> · </span>
      {visible.map((dish, index) => (
        <span key={dish}>
          {index > 0 && <span aria-hidden="true">, </span>}
          <span lang={detectTextLang(dish)} className="text-ink-muted">
            {dish}
          </span>
        </span>
      ))}
      {hidden > 0 && <span> +{hidden}</span>}
    </p>
  );
}
