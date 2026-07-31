"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CityHeaderMark } from "@/components/city-signature/CitySignature";
import { ACTIVE_FIYU_CITY, FIYU_CITIES, type CityId } from "@/lib/city/editions";
import {
  DESKTOP_NAVIGATION_ORDER,
  MOBILE_NAVIGATION_ORDER,
  navigationIsActive,
  navigationItem,
} from "@/lib/navigation/appNavigation";
import { cn } from "@/lib/utils/cn";

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 fill-none stroke-current">
      <path d="m4 6 4 4 4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current">
      <path
        d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9ZM10 21h4"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current">
      <path d="M4 6h16M4 12h16M4 18h16" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CitySelector({
  activeCityId,
  align = "left",
  onSelectCity,
}: {
  activeCityId: CityId;
  align?: "left" | "right";
  onSelectCity: (cityId: CityId) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const activeCity = FIYU_CITIES.find((city) => city.id === activeCityId) ?? ACTIVE_FIYU_CITY;

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      const details = detailsRef.current;
      if (event.key !== "Escape" || !details?.open) return;
      details.open = false;
      summaryRef.current?.focus();
    };

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, []);

  const selectCity = (cityId: CityId) => {
    onSelectCity(cityId);
    if (detailsRef.current) detailsRef.current.open = false;
    summaryRef.current?.focus();
  };

  return (
    <details ref={detailsRef} data-active-city-id={activeCity.id} className="group relative">
      <summary
        ref={summaryRef}
        aria-label={`Choose Fiyu city edition. Current city: ${activeCity.name}`}
        className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <span>{activeCity.name}</span>
        <CityHeaderMark cityId={activeCity.id} />
        <ChevronIcon />
      </summary>
      <div
        className={cn(
          "absolute top-[calc(100%+0.5rem)] z-50 w-64 rounded-card border border-line bg-surface p-2 shadow-xl",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        <p className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-faint uppercase">
          Fiyu editions
        </p>
        {FIYU_CITIES.map((city) =>
          city.status === "available" ? (
            <button
              key={city.id}
              type="button"
              onClick={() => selectCity(city.id)}
              aria-current={city.id === activeCity.id ? "true" : undefined}
              className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm text-ink hover:bg-subtle"
            >
              <span>
                {city.name}
                <span className="ml-2 text-xs text-ink-faint">{city.country}</span>
              </span>
              <span className="text-xs font-medium text-lavender-700">Available</span>
            </button>
          ) : (
            <button
              key={city.id}
              type="button"
              disabled
              aria-disabled="true"
              className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm text-ink-muted"
            >
              <span>
                {city.name}
                <span className="ml-2 text-xs text-ink-faint">{city.country}</span>
              </span>
              <span className="text-[0.6875rem] font-medium tracking-wide text-ink-faint uppercase">
                Coming soon
              </span>
            </button>
          ),
        )}
      </div>
    </details>
  );
}

function NotificationsMenu() {
  return (
    <details className="group relative">
      <summary
        aria-label="Notifications"
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <BellIcon />
      </summary>
      <div className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-64 rounded-card border border-line bg-surface p-4 shadow-xl">
        <p className="text-sm font-semibold text-ink">Notifications</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">Nothing new right now.</p>
      </div>
    </details>
  );
}

function MobileMenu() {
  return (
    <details className="group relative lg:hidden">
      <summary
        aria-label="Open menu"
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <MenuIcon />
      </summary>
      <nav
        aria-label="More"
        className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-48 rounded-card border border-line bg-surface p-2 shadow-xl"
      >
        <Link href="/profile#settings" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-ink hover:bg-subtle">
          Settings
        </Link>
        <Link href="/profile#help" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-ink hover:bg-subtle">
          Help
        </Link>
        <Link href="/profile#privacy" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-ink hover:bg-subtle">
          Privacy
        </Link>
      </nav>
    </details>
  );
}

export function ApplicationNavigation() {
  const pathname = usePathname();
  const detailRoute = pathname.startsWith("/restaurants/");
  const [activeCityId, setActiveCityId] = useState<CityId>(ACTIVE_FIYU_CITY.id);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 h-header border-b border-line bg-canvas/95 backdrop-blur-sm",
          detailRoute && "hidden lg:block",
        )}
      >
        <div className="mx-auto flex h-full w-full max-w-[1560px] items-center px-4 pt-[env(safe-area-inset-top)] sm:px-8">
          <div className="flex min-w-0 items-center gap-1 lg:hidden">
            <Link
              href="/picks"
              aria-label="Fiyu Picks"
              className="mr-1 font-display text-[1.45rem] leading-none text-ink transition-colors hover:text-lavender-700"
            >
              Fiyu
            </Link>
            <CitySelector activeCityId={activeCityId} onSelectCity={setActiveCityId} />
          </div>

          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <Link
              href="/"
              className="font-display text-[1.45rem] leading-none text-ink transition-colors hover:text-lavender-700"
            >
              Fiyu
            </Link>
            <span aria-hidden="true" className="h-4 w-px bg-line-strong" />
            <CitySelector activeCityId={activeCityId} onSelectCity={setActiveCityId} />
          </div>

          <nav aria-label="Primary" className="ml-10 hidden h-full items-center gap-1 lg:flex">
            {DESKTOP_NAVIGATION_ORDER.map((id) => {
              const item = navigationItem(id);
              const active = navigationIsActive(pathname, item);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-lavender-100 text-lavender-700"
                      : "text-ink-muted hover:bg-subtle hover:text-ink",
                  )}
                >
                  {item.id === "log" ? "Log a Visit" : item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <NotificationsMenu />
            <MobileMenu />
            {(() => {
              const profile = navigationItem("profile");
              const active = navigationIsActive(pathname, profile);
              return (
                <Link
                  href={profile.href}
                  aria-label={profile.accessibleLabel}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "hidden min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors lg:flex",
                    active
                      ? "bg-lavender-100 text-lavender-700"
                      : "text-ink-muted hover:bg-subtle hover:text-ink",
                  )}
                >
                  <profile.icon className="size-5" />
                  Profile
                </Link>
              );
            })()}
          </div>
        </div>
      </header>

      {/*
       * Cream rather than white, matching the header: the bar then reads as app
       * chrome bracketing the canvas rather than as a card floating on it. The
       * blur is the header's, kept light enough that labels stay legible over
       * whatever scrolls beneath.
       */}
      {!detailRoute && <nav
        aria-label="Mobile primary"
        className="fixed inset-x-0 bottom-0 z-40 grid h-mobile-nav grid-cols-5 items-stretch border-t border-line bg-canvas/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_28px_-24px_rgba(49,40,61,0.4)] backdrop-blur-sm lg:hidden"
      >
        {MOBILE_NAVIGATION_ORDER.map((id) => {
          const item = navigationItem(id);
          const active = navigationIsActive(pathname, item);
          const log = item.id === "log";
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.accessibleLabel}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg px-1 text-[0.8125rem] font-medium transition-colors duration-200 ease-(--ease-fiyu)",
                active ? "text-lavender-700" : "text-ink-muted hover:text-ink",
                // Log keeps a quiet tinted field instead of a raised centre
                // action: enough to find by thumb, not enough to shout.
                log &&
                  "before:absolute before:inset-x-2.5 before:inset-y-2.5 before:-z-10 before:rounded-xl before:border before:border-line before:bg-subtle",
              )}
            >
              {/*
               * The plus is a single stroked cross, so it needs a touch more
               * weight than an outlined glyph to read at the same size. Spread
               * conditionally: passing `strokeWidth={undefined}` would override
               * the shared icon default rather than leave it alone.
               */}
              <item.icon
                className="size-6"
                {...(log ? { strokeWidth: 2.1 } : {})}
              />
              <span className="whitespace-nowrap leading-4">{item.label}</span>
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-[0.1875rem] w-8 rounded-b-full bg-lavender-600"
                />
              )}
            </Link>
          );
        })}
      </nav>}
    </>
  );
}
