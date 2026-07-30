"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const navigation = [
  { href: "#explore", label: "Explore" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#why-few", label: "Why only a few?" },
] as const;

export function LandingHeader() {
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
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center px-5 sm:px-8 lg:px-12">
        <Link
          href="/"
          aria-label="Fiyu home"
          className="font-display text-[1.7rem] leading-none text-ink transition-colors hover:text-lavender-700"
        >
          Fiyu
        </Link>

        <nav aria-label="Landing page" className="ml-auto hidden items-center gap-7 md:flex">
          {navigation.map((item) => (
            <a
              key={item.href}
              className="text-sm text-ink-muted transition-colors hover:text-ink"
              href={item.href}
            >
              {item.label}
            </a>
          ))}
          <Link
            href="/picks"
            className="inline-flex min-h-11 items-center rounded-chip bg-plum px-5 text-sm font-medium text-white transition-colors hover:bg-lavender-700"
          >
            Explore Tokyo
          </Link>
        </nav>

        <Link
          href="/picks"
          className="ml-auto hidden min-h-10 items-center rounded-chip bg-plum px-4 text-sm font-medium text-white min-[390px]:inline-flex md:hidden"
        >
          Explore Tokyo
        </Link>
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
        className="absolute inset-x-0 top-full border-b border-line bg-canvas px-5 py-5 shadow-[0_16px_30px_-24px_rgba(49,40,61,0.35)] md:hidden"
      >
        <div className="mx-auto flex max-w-[90rem] flex-col">
          {navigation.map((item, index) => (
            <a
              key={item.href}
              ref={index === 0 ? firstMenuLinkRef : undefined}
              href={item.href}
              onClick={closeMenu}
              className="flex min-h-12 items-center border-b border-line text-base text-ink last:border-b-0"
            >
              {item.label}
            </a>
          ))}
          <Link
            href="/picks"
            onClick={closeMenu}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-chip bg-plum px-6 text-sm font-medium text-white min-[390px]:hidden"
          >
            Explore Tokyo
          </Link>
        </div>
      </nav>
    </header>
  );
}
