"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { cn } from "@/lib/utils/cn";

const navigation = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/signin", label: "Sign in" },
] as const;

/**
 * Sticky state read as an external store rather than as effect state.
 *
 * The server has no scroll position, so the server snapshot is always false and
 * the first client render matches it; React re-reads after hydration.
 */
function subscribeScroll(listener: () => void) {
  window.addEventListener("scroll", listener, { passive: true });
  return () => window.removeEventListener("scroll", listener);
}
const scrollSnapshot = () => window.scrollY > 8;
const scrollServerSnapshot = () => false;

export function LandingHeader() {
  const lifted = useSyncExternalStore(subscribeScroll, scrollSnapshot, scrollServerSnapshot);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    firstMenuLinkRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      // No border and no blur at rest, so the header reads as part of the page
      // rather than as a toolbar sitting on top of it; both arrive on scroll.
      className={cn(
        "sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)]",
        "transition-[background-color,border-color] duration-300 ease-(--ease-fiyu)",
        lifted ? "border-line bg-canvas/95 backdrop-blur-sm" : "border-transparent bg-canvas",
      )}
    >
      <div className={cn(LANDING_MEASURE, "flex min-h-16 items-center lg:min-h-[4.5rem]")}>
        <Link
          href="/"
          aria-label="Fiyu home"
          className="font-display text-[1.5rem] leading-none tracking-[-0.02em] text-ink transition-colors duration-200 ease-(--ease-fiyu) hover:text-lavender-700 lg:text-[1.625rem]"
        >
          Fiyu
        </Link>

        <nav aria-label="Landing page" className="ml-auto hidden items-center gap-8 md:flex">
          {navigation.map((item) => (
            <Link
              key={item.href}
              className="text-[0.9375rem] text-ink-muted underline decoration-transparent decoration-1 underline-offset-[6px] transition-colors duration-200 ease-(--ease-fiyu) hover:text-ink hover:decoration-rose-dust"
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
          <span aria-hidden="true" className="ml-1 h-4 w-px bg-line-strong" />
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center rounded-chip bg-plum px-6 text-sm font-medium text-white transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-700"
          >
            Sign up
          </Link>
        </nav>

        <button
          ref={menuButtonRef}
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="landing-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
          className="ml-2 flex size-11 items-center justify-center rounded-full text-plum md:hidden"
        >
          <span aria-hidden="true" className="relative block h-4 w-5">
            <span
              className={`absolute left-0 h-px w-5 bg-current transition-transform duration-200 ${
                menuOpen ? "top-2 rotate-45" : "top-1"
              }`}
            />
            <span
              className={`absolute left-0 top-2 h-px w-5 bg-current transition-opacity duration-200 ${
                menuOpen ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 h-px w-5 bg-current transition-transform duration-200 ${
                menuOpen ? "top-2 -rotate-45" : "top-3"
              }`}
            />
          </span>
        </button>
      </div>

      <nav
        id="landing-mobile-menu"
        aria-label="Landing page mobile"
        hidden={!menuOpen}
        className={cn(
          LANDING_MEASURE,
          "absolute inset-x-0 top-full border-b border-line bg-canvas py-5 shadow-[0_16px_30px_-24px_rgba(49,40,61,0.35)] md:hidden",
        )}
      >
        <div className="flex flex-col">
          {navigation.map((item, index) => (
            <Link
              key={item.href}
              ref={index === 0 ? firstMenuLinkRef : undefined}
              href={item.href}
              onClick={closeMenu}
              className="flex min-h-12 items-center border-b border-line text-base text-ink last:border-b-0"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/signup"
            onClick={closeMenu}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-chip bg-plum px-6 text-sm font-medium text-white"
          >
            Sign up
          </Link>
        </div>
      </nav>
    </header>
  );
}
