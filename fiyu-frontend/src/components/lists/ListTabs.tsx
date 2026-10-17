"use client";

import { cn } from "@/lib/utils/cn";

export function ListTabs({
  activeTab,
  onChange,
}: {
  activeTab: "saved" | "smart";
  onChange(tab: "saved" | "smart"): void;
}) {
  return (
    <div className="mb-4 border-b border-line">
      <div role="tablist" aria-label="List sections" className="flex items-center gap-4">
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
            "relative inline-flex min-h-11 items-center text-sm font-medium text-ink-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
            activeTab === "smart" ? "text-plum" : "hover:text-ink",
          )}
        >
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
