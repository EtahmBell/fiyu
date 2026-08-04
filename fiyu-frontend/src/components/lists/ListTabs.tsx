"use client";

import { cn } from "@/lib/utils/cn";

function SmartSparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={cn("size-3.5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.6 9 4.3l2.8 1L9 6.2 8 8.9 7 6.2l-2.8-.9L7 4.3 8 1.6Z" />
      <path d="M12.9 9.2 13.4 10.5l1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3Z" />
      <path d="M3.3 9.9 3.8 11l1.1.5-1.1.4-.5 1.2-.4-1.2-1.2-.4 1.2-.5.4-1.1Z" />
    </svg>
  );
}

export function ListTabs({
  activeTab,
  onChange,
}: {
  activeTab: "saved" | "smart";
  onChange(tab: "saved" | "smart"): void;
}) {
  return (
    <div className="mb-5 border-b border-line">
      <div role="tablist" aria-label="List sections" className="flex items-center gap-5">
        <button
          type="button"
          role="tab"
          id="lists-tab-saved"
          aria-selected={activeTab === "saved"}
          aria-controls="lists-panel-saved"
          onClick={() => onChange("saved")}
          className={cn(
            "relative inline-flex min-h-11 items-center text-sm font-medium text-ink-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
            activeTab === "saved" ? "text-plum" : "hover:text-ink",
          )}
        >
          Saved
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute -bottom-px left-0 h-0.5 w-full rounded-full bg-plum transition-opacity",
              activeTab === "saved" ? "opacity-100" : "opacity-0",
            )}
          />
        </button>

        <button
          type="button"
          role="tab"
          id="lists-tab-smart"
          aria-selected={activeTab === "smart"}
          aria-controls="lists-panel-smart"
          onClick={() => onChange("smart")}
          className={cn(
            "relative inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
            activeTab === "smart" ? "text-plum" : "hover:text-ink",
          )}
        >
          {/* The sparkle stays lavender in both states: it is the accent, not the
              selection cue -- the plum rule underneath carries that. */}
          <SmartSparkleIcon
            className={activeTab === "smart" ? "text-lavender-600" : "text-lavender-500/70"}
          />
          <span>Smart</span>
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute -bottom-px left-0 h-0.5 w-full rounded-full bg-plum transition-opacity",
              activeTab === "smart" ? "opacity-100" : "opacity-0",
            )}
          />
        </button>
      </div>
    </div>
  );
}
