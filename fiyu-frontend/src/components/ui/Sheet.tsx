"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils/cn";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Modal surface: a bottom sheet on small screens, a right-hand side panel from
 * `md` up.
 *
 * Built on the native <dialog> element, which provides focus trapping, inert
 * background content, Escape handling and top-layer stacking without a focus
 * management library or a portal.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      // Escape fires `cancel`; route the close through our own handler so the
      // URL and the dialog never disagree about what is open.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      // Backdrop clicks land on the dialog element itself, not on its content.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-0 text-ink backdrop:bg-plum/30",
        // Bottom sheet on mobile.
        "mt-auto w-full",
        // Side panel from md up.
        "md:mt-0 md:ml-auto md:h-full md:w-[min(30rem,100%)]",
      )}
    >
      <div
        className={cn(
          "flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-2xl bg-surface shadow-xl",
          "md:max-h-none md:h-full md:rounded-none md:border-l md:border-line",
          className,
        )}
        style={{ animation: "fiyu-sheet-in 200ms ease-out" }}
      >
        {/* Drag affordance. Decorative: dismissal is via Escape, backdrop or
            the close control inside the panel content. */}
        <div aria-hidden="true" className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
        {children}
      </div>
    </dialog>
  );
}
