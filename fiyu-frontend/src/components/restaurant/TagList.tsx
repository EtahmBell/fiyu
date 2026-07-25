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
 * Food tags. Each tag is language-detected individually because a single
 * restaurant's tags can mix scripts (the backend has no language marker), and
 * an untagged Japanese run breaks incorrectly at the end of a line.
 */
export function TagList({ tags, max, className }: TagListProps) {
  if (tags.length === 0) return null;

  const visible = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.length - visible.length;

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {visible.map((tag) => (
        <li key={tag}>
          <Badge tone="neutral" lang={detectTextLang(tag)}>
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
