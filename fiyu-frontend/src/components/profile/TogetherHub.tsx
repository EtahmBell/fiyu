"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CompactRestaurantCard } from "@/components/daily-picks/CompactRestaurantCard";
import {
  TOGETHER_CAPS,
  TogetherAvatar,
  TogetherPairMark,
  usePrefersReducedMotion,
  type TogetherPerson,
} from "@/components/profile/TogetherIdentity";
import { TogetherPendingInvitation } from "@/components/profile/TogetherPendingInvitation";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { Button } from "@/components/ui/Button";
import { createTogetherInvite, fetchTogetherState } from "@/lib/api/client";
import type { TogetherInviteCreated, TogetherSession, TogetherState } from "@/lib/api/schemas";
import { useAccountQuery } from "@/lib/accountQueryCache";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { consumeTogetherRevealArrival } from "@/lib/profile/togetherRevealArrival";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";
import { cn } from "@/lib/utils/cn";

/**
 * The Fiyu Together hub.
 *
 * Together's home, and the only place a shared set is read. The page is built
 * as one masthead and one content area rather than as a stack of per-partner
 * sections: a user may hold three Togethers in a cycle, and three full
 * treatments on one screen would turn a calm editorial page into a dashboard
 * of relationships. The selector changes who the single content area is about.
 *
 * Colour follows the page's own rhythm rather than being spread evenly. The
 * masthead carries the deep plum ground -- one band, at the top, where the
 * feature announces itself -- and everything below it returns to canvas with
 * pale plum grounds and hairlines. The restaurants stay on white paper, which
 * is the point: the pair is the context, not the content.
 *
 * Nothing on this page decides what a Together contains. Sessions, ranking,
 * quota and reveal state all arrive from `/together/me` exactly as the backend
 * computed them; the only thing held locally is which of them is on screen.
 */

/** One measure for the masthead and the content beneath it. */
const MEASURE = "mx-auto w-full max-w-[64rem] px-5 sm:px-8 lg:px-12";

/**
 * The reveal stagger.
 *
 * 150ms between cards: enough that the three arrive as a sequence rather than
 * a block, short enough that the last one is in place 300ms after the first.
 * Nobody is made to wait through a show.
 */
const STAGGER_MS = 150;

function partnerPerson(session: TogetherSession | null): TogetherPerson {
  return {
    displayName: session?.partner?.display_name ?? "Your partner",
    avatarUrl: session?.partner?.avatar_url ?? null,
  };
}

export function TogetherHub({ initialSessionId }: { initialSessionId?: string }) {
  const router = useRouter();
  const identity = useProfileIdentity();
  const reducedMotion = usePrefersReducedMotion();
  const accountId = identity.profile?.user_id;
  const load = useCallback(() => fetchTogetherState(), []);
  const query = useAccountQuery<TogetherState>({
    resource: "together-state",
    accountId,
    loader: load,
    enabled: identity.status === "ready" && Boolean(accountId),
    maxAgeMs: 30_000,
  });
  const list = useDefaultList("tokyo", { accountId });
  const [selectedId, setSelectedId] = useState(initialSessionId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sessions = useMemo(() => query.data?.current_sessions ?? [], [query.data?.current_sessions]);
  const pending = query.data?.session?.status === "pending" ? query.data.session : null;
  const pendingStatus = query.data?.session?.status;
  const refreshTogether = query.refresh;
  const selected = useMemo(
    () => sessions.find((session) => session.session_id === selectedId) ?? sessions[0] ?? null,
    [selectedId, sessions],
  );

  /*
   * True only on the arrival that ends a reveal, and only for that session.
   * Read during render via state so the very first paint of the cards already
   * carries its delay -- deciding in an effect would flash them in first.
   */
  const [staggeredSessionId] = useState(() =>
    initialSessionId && consumeTogetherRevealArrival(initialSessionId) ? initialSessionId : null,
  );
  const staggering = !reducedMotion && selected?.session_id === staggeredSessionId;

  useEffect(() => {
    if (identity.status === "ready" && !accountId) {
      router.replace("/signin?next=%2Ftogether");
    }
  }, [accountId, identity.status, router]);

  useEffect(() => {
    if (pendingStatus !== "pending") return;
    const refresh = () => void refreshTogether(true).catch(() => undefined);
    const interval = window.setInterval(refresh, 5_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [pendingStatus, refreshTogether]);

  const share = async (created: TogetherInviteCreated) => {
    const nativeShare = (navigator as unknown as { share?: (data: ShareData) => Promise<void> }).share;
    if (nativeShare) await nativeShare.call(navigator, { title: "Fiyu Together", text: "Find three Fiyu Picks with me.", url: created.invite_url });
    else await navigator.clipboard.writeText(created.invite_url);
    setMessage(nativeShare ? "Invite ready to share." : "Invite link copied.");
  };

  const start = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const created = await createTogetherInvite();
      if (query.data) query.setData({ ...query.data, can_initiate: false, session: created.session });
      await share(created);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage(error instanceof Error ? error.message : "Together is unavailable right now.");
      }
    } finally { setBusy(false); }
  };

  if (identity.status === "loading" || !accountId || query.status === "loading") return <FiyuLoadingScreen />;

  const you: TogetherPerson = {
    displayName: identity.profile?.display_name ?? identity.profile?.username ?? "You",
    avatarUrl: identity.profileImage,
  };
  const state = query.data;
  const atCycleCap = state?.block_reason === "cycle_limit_reached";

  return (
    <main className="flex-1 pb-[calc(var(--spacing-mobile-nav)+2rem)] lg:pb-20">
      {/*
       * The masthead is the feature's signature and the only deep ground on
       * the page. It bleeds the full width rather than sitting inside the
       * measure, so Together announces itself before a word is read -- and so
       * it can never be confused with the champagne band that carries history.
       */}
      <header className="bg-plum-900">
        <div className={cn(MEASURE, "py-9 sm:py-12 lg:flex lg:items-end lg:justify-between lg:gap-10 lg:py-14")}>
          <div className="lg:max-w-[34rem]">
            <p className={cn(TOGETHER_CAPS, "text-plum-mist")}>Fiyu Together</p>
            {/*
             * Sized against the viewport rather than at breakpoints, and
             * broken by a measure rather than by a hard `<br>`: at 390px a
             * fixed 32px line plus a forced break wrapped into a ragged third
             * line. The type now scales down instead.
             */}
            <h1 className="mt-4 max-w-[20ch] font-display text-[clamp(1.75rem,7.2vw,3rem)] leading-[1.12] text-balance text-white">
              Places chosen for you and the people you’re with.
            </h1>
          </div>
          {sessions.length > 0 ? (
            <p className="mt-5 text-sm text-plum-mist lg:mt-0 lg:shrink-0 lg:text-right">
              {sessions.length === 1
                ? "One Together this cycle"
                : `${sessions.length} Togethers this cycle`}
            </p>
          ) : null}
        </div>
      </header>

      <div className={cn(MEASURE, "pt-7 sm:pt-9")}>
        {/*
         * The partner selector, shown only when there is a choice to make.
         * Selection is carried by fill, by weight and by a plum rule beneath
         * the chip, never by colour alone, and each chip is a pressed-state
         * button so the current partner is announced as such.
         */}
        {sessions.length > 1 ? (
          <div
            role="group"
            aria-label="Together partners"
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0"
          >
            {sessions.map((session) => {
              const active = selected?.session_id === session.session_id;
              const person = partnerPerson(session);
              return (
                <button
                  key={session.session_id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (active) return;
                    setSelectedId(session.session_id);
                    router.replace(`/together?session=${encodeURIComponent(session.session_id)}`, { scroll: false });
                  }}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-chip border py-1.5 pr-4 pl-1.5 text-sm transition-colors duration-[150ms] ease-(--ease-fiyu)",
                    active
                      ? "border-plum-500/45 bg-plum-100 font-semibold text-plum-700"
                      : "border-line bg-surface text-ink-muted hover:border-plum-line hover:text-ink",
                  )}
                >
                  <TogetherAvatar person={person} size="sm" tone="light" className="size-8" />
                  <span className="whitespace-nowrap">{person.displayName}</span>
                  {session.reveal_pending ? (
                    <span className={cn(TOGETHER_CAPS, "text-plum-700")}>New</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {message ? (
          <p role="status" className="mt-5 text-sm text-ink-muted">
            {message}
          </p>
        ) : null}

        {pending ? (
          <TogetherPendingInvitation
            className="mt-7"
            sessionId={pending.session_id}
            accountId={accountId}
            onResolved={async (notice) => { setMessage(notice); await refreshTogether(true); }}
          />
        ) : null}

        {selected ? (
          /*
           * Keyed on the session so switching partners remounts the content
           * and plays one short fade, rather than cross-dissolving three
           * restaurant cards into three others.
           */
          <section
            key={selected.session_id}
            className="mt-7 sm:mt-9"
            aria-labelledby="selected-together-title"
            style={reducedMotion ? undefined : { animation: "fiyu-fade-in 140ms var(--ease-fiyu)" }}
          >
            <div className="flex flex-col items-start gap-4 border-b border-plum-line pb-6 sm:flex-row sm:items-center sm:gap-5">
              <TogetherPairMark people={[you, partnerPerson(selected)]} size="md" />
              <div className="min-w-0">
                <h2 id="selected-together-title" className="font-display text-2xl leading-tight text-ink sm:text-[1.75rem]">
                  Together with {partnerPerson(selected).displayName}
                </h2>
                {/*
                 * The pair is named once. An unrevealed set says nothing more
                 * here, because the panel below it is about to -- and the
                 * partner's name three times on one screen is a page talking
                 * to itself.
                 */}
                {selected.reveal_pending ? null : (
                  <p className="mt-1 text-sm text-ink-muted">
                    {selected.restaurants.length} Picks chosen for both of you
                  </p>
                )}
              </div>
            </div>

            {selected.reveal_pending ? (
              /*
               * An unrevealed set names nobody. The hub never fetches or draws
               * the restaurants for it, and the reveal itself stays on its own
               * route so there is exactly one implementation of that moment.
               */
              <div className="mt-7 rounded-card border border-plum-line bg-plum-50 px-6 py-9 text-center">
                <p className="font-display text-2xl leading-tight text-ink">
                  Your Picks are ready.
                </p>
                <p className="mt-2 text-sm text-ink-body">
                  {selected.pick_count} places are waiting for the two of you.
                </p>
                <Link
                  href={`/together/session/${encodeURIComponent(selected.session_id)}`}
                  className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-plum-900 px-6 text-sm font-semibold text-white transition-[background-color,transform] duration-[180ms] ease-(--ease-fiyu) hover:bg-plum active:scale-[0.98]"
                >
                  Reveal our Picks →
                </Link>
              </div>
            ) : (
              /*
               * A plum ground beneath white cards. The tint is what tells a
               * reader this run of restaurants belongs to a pair; the cards
               * themselves keep the same paper, the same structure and the
               * same actions they have everywhere else in Fiyu.
               */
              <div className="mt-6 rounded-card border border-plum-line bg-plum-50/70 p-2 sm:p-4">
                <div className="space-y-3 sm:space-y-4">
                  {selected.restaurants.map((restaurant, index) => (
                    <div
                      key={restaurant.place_id}
                      // The attribute carries this card's place in the
                      // sequence and is what the reduced-motion rule in
                      // `globals.css` looks for; it is absent entirely on an
                      // ordinary visit, so nothing animates.
                      data-fiyu-stagger={staggering ? String(index * STAGGER_MS) : undefined}
                      style={
                        staggering
                          ? {
                              animation: "fiyu-reveal-in 360ms var(--ease-fiyu) both",
                              animationDelay: `${index * STAGGER_MS}ms`,
                            }
                          : undefined
                      }
                    >
                      <CompactRestaurantCard
                        restaurant={restaurant}
                        tone="together"
                        saved={list.isSaved(restaurant.place_id)}
                        savePending={list.pendingPlaceIds.includes(restaurant.place_id)}
                        onToggleSaved={() => void list.toggle(restaurant.place_id)}
                        onViewDetails={() => router.push(`/restaurants/${encodeURIComponent(restaurant.place_id)}`)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : query.status === "error" ? (
          <p role="alert" className="mt-8 text-sm text-ink-muted">
            Together is unavailable right now.
          </p>
        ) : pending ? null : (
          /*
           * The empty hub. A reader who arrives here has no Together this
           * cycle, so the page has to explain the feature in three lines
           * without becoming a pitch.
           */
          <section className="mt-8 max-w-[34rem] sm:mt-10">
            <h2 className="max-w-[18ch] font-display text-[clamp(1.625rem,6.5vw,2rem)] leading-tight text-balance text-ink">
              Find somewhere that works for both of you.
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink-body">
              Three Picks, chosen around your shared taste.
            </p>
            <div className="mt-6">
              <TogetherInitiation state={state} busy={busy} onStart={() => void start()} />
            </div>
          </section>
        )}

        {/*
         * Starting another is a quiet line beneath the set, not a second
         * headline competing with it -- and the cycle cap is stated as a fact
         * rather than displayed as a meter. Quota mechanics are not the
         * feature.
         */}
        {selected && state?.can_initiate && !pending ? (
          <div className="mt-8 border-t border-line pt-6">
            <button
              type="button"
              disabled={busy}
              onClick={() => void start()}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-plum-700 underline decoration-plum-line underline-offset-4 transition-colors hover:decoration-plum-500 disabled:opacity-50"
            >
              Start another Together <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : selected && atCycleCap ? (
          <p className="mt-8 border-t border-line pt-6 text-xs text-ink-faint">
            That’s every Together for this cycle. New Picks bring new ones.
          </p>
        ) : null}
      </div>
    </main>
  );
}

/**
 * The one place the hub speaks about entitlement, and it does so honestly:
 * what is true now, in the fewest words, with no checkout and no coupon.
 */
function TogetherInitiation({
  state,
  busy,
  onStart,
}: {
  state: TogetherState | undefined;
  busy: boolean;
  onStart: () => void;
}) {
  if (!state) return null;
  if (state.block_reason === "ratings_required") {
    const remaining = Math.max(state.ratings_required - state.rated_visit_count, 0);
    return (
      <p className="text-sm leading-6 text-ink-body">
        Rate {remaining} more visit{remaining === 1 ? "" : "s"} to unlock Fiyu Together.
      </p>
    );
  }
  if (state.block_reason === "premium_required") {
    return (
      <p className="text-sm leading-6 text-ink-body">
        Fiyu Together is available with Fiyu Premium.
      </p>
    );
  }
  if (state.block_reason === "cycle_limit_reached") {
    return (
      <p className="text-sm leading-6 text-ink-body">
        That’s every Together for this cycle. New Picks bring new ones.
      </p>
    );
  }
  if (!state.can_initiate) return null;
  return (
    <>
      <Button variant="primary" disabled={busy} onClick={onStart}>
        Start Together
      </Button>
      {!state.premium ? (
        <p className="mt-3 text-xs text-ink-muted">Your first Together is included.</p>
      ) : null}
    </>
  );
}
