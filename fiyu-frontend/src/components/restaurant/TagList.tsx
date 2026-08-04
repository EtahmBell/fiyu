import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { detectTextLang } from "@/lib/format/language";
import { formatTagForDisplay } from "@/lib/format/tags";
import { cn } from "@/lib/utils/cn";

export interface TagListProps {
  tags: string[];
  /** Tags beyond this are summarised as "+N". Omit to show all. */
  max?: number;
  /** Apply presentation-only English title casing without changing stored tags. */
  titleCaseEnglish?: boolean;
  /** Badge treatment. Outlined by default; `lavender` tints the pill instead. */
  tone?: BadgeTone;
  className?: string;
}

/**
 * Food tags rendered from immutable API values.
 *
 * Outlined rather than filled: a row of filled chips is the single most
 * dashboard-looking element on a card. No translation, romanization or
 * relabelling happens here -- localization is the backend's responsibility, so
 * 江戸前寿司 and おまかせ display verbatim.
 *
 * `detectTextLang` only chooses a `lang` attribute so Japanese gets the right
 * font and kinsoku line-breaking. It never alters the string.
 */
export function TagList({
  tags,
  max,
  titleCaseEnglish = false,
  tone = "outline",
  className,
}: TagListProps) {
  if (tags.length === 0) return null;

  const visible = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.length - visible.length;

  return (
    <ul className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {visible.map((tag) => (
        // A single long tag must wrap inside the card rather than widen it.
        <li key={tag} className="min-w-0 max-w-full">
          <Badge tone={tone} lang={detectTextLang(tag)} className="max-w-full break-words">
            {titleCaseEnglish ? formatTagForDisplay(tag) : tag}
          </Badge>
        </li>
      ))}
      {hidden > 0 && (
        <li className="min-w-0 max-w-full">
          <Badge
            tone="quiet"
            title={tags
              .slice(visible.length)
              .map((tag) => (titleCaseEnglish ? formatTagForDisplay(tag) : tag))
              .join(", ")}
          >
            +{hidden}
          </Badge>
        </li>
      )}
    </ul>
  );
}
