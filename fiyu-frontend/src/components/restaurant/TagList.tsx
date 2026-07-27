import { Badge } from "@/components/ui/Badge";
import { detectTextLang } from "@/lib/format/language";
import { cn } from "@/lib/utils/cn";

export interface TagListProps {
  tags: string[];
  /** Tags beyond this are summarised as "+N". Omit to show all. */
  max?: number;
  className?: string;
}

/**
 * Food tags, rendered exactly as the API returns them.
 *
 * Outlined rather than filled: a row of filled chips is the single most
 * dashboard-looking element on a card. No translation, romanization or
 * relabelling happens here -- localization is the backend's responsibility, so
 * 江戸前寿司 and おまかせ display verbatim.
 *
 * `detectTextLang` only chooses a `lang` attribute so Japanese gets the right
 * font and kinsoku line-breaking. It never alters the string.
 */
export function TagList({ tags, max, className }: TagListProps) {
  if (tags.length === 0) return null;

  const visible = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.length - visible.length;

  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.map((tag) => (
        <li key={tag}>
          <Badge tone="outline" lang={detectTextLang(tag)}>
            {tag}
          </Badge>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <Badge tone="quiet" title={tags.slice(visible.length).join(", ")}>
            +{hidden}
          </Badge>
        </li>
      )}
    </ul>
  );
}
