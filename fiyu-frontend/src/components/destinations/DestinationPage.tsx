import type { ReactNode } from "react";

import { Eyebrow } from "@/components/ui/Eyebrow";

export function DestinationPage({
  eyebrow = "Tokyo edition",
  title,
  description,
  children,
  hideHeaderOnMobile = false,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  hideHeaderOnMobile?: boolean;
}) {
  return (
    <main className="flex-1 px-page pt-9 pb-[calc(var(--spacing-mobile-nav)+2rem)] lg:py-14">
      <div className="mx-auto w-full max-w-4xl">
        <div className={hideHeaderOnMobile ? "hidden lg:block" : undefined}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-none text-ink sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted sm:text-base">
            {description}
          </p>
        </div>
        {children && <div className={hideHeaderOnMobile ? "lg:mt-8" : "mt-8"}>{children}</div>}
      </div>
    </main>
  );
}

export function DestinationNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-[0_8px_24px_-22px_rgba(49,40,61,0.5)] sm:p-6">
      {children}
    </div>
  );
}
