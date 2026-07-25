import { detectTextLang } from "@/lib/format/language";
import { cn } from "@/lib/utils/cn";

export interface SignatureDishesProps {
  dishes: string[];
  max?: number;
  className?: string;
}

/**
 * Signature dishes, rendered as prose rather than as chips so they read as
 * editorial detail and stay visually distinct from the food tags above them.
 */
export function SignatureDishes({ dishes, max, className }: SignatureDishesProps) {
  if (dishes.length === 0) return null;

  const visible = max === undefined ? dishes : dishes.slice(0, max);
  const hidden = dishes.length - visible.length;

  return (
    <p className={cn("text-sm leading-relaxed text-ink-muted", className)}>
      <span className="text-ink-faint">Signature </span>
      {visible.map((dish, index) => (
        <span key={dish}>
          {index > 0 && <span className="text-ink-faint"> · </span>}
          <span lang={detectTextLang(dish)}>{dish}</span>
        </span>
      ))}
      {hidden > 0 && <span className="text-ink-faint"> +{hidden}</span>}
    </p>
  );
}
