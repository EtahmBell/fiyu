"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  TOGETHER_CAPS,
  TogetherAvatarStack,
  TogetherAwaitingMark,
  type TogetherPerson,
} from "@/components/profile/TogetherIdentity";
import type { TogetherState } from "@/lib/api/schemas";
import { cn } from "@/lib/utils/cn";

/**
 * Fiyu Together on the Picks page.
 *
 * Picks is about the three restaurants Fiyu chose for one person today, and it
 * stays that way: this is a single row between the solo Picks and Recent
 * Discoveries, never a second set of restaurant cards. Its whole job is to say
 * what is true about Together right now in one line and offer one way in.
 *
 * It is also where the plum identity is introduced, and the reason it is drawn
 * in plum at all: Recent Discoveries sits directly beneath it in champagne, and
 * a reader scrolling past has to be able to tell the pair's Picks from their
 * own history without reading either heading.
 *
 * The row's height does not grow with the number of partners. Three sessions
 * are three overlapping faces and a list of names on one line, because the
 * detail belongs to the hub.
 */

interface EntryContent {
  mark: ReactNode;
  headline: string;
  detail: string | null;
  action: string | null;
  href: string;
}

function partners(state: TogetherState): TogetherPerson[] {
  return state.current_sessions.map((session) => ({
    displayName: session.partner?.display_name ?? "Your partner",
    avatarUrl: session.partner?.avatar_url ?? null,
  }));
}

function entryContent(state: TogetherState): EntryContent | null {
  const unrevealed = state.current_sessions.find((session) => session.reveal_pending);

  /*
   * A set this participant has not opened outranks everything else on the
   * row, and links straight to its one-time reveal rather than to the hub:
   * the moment is the destination.
   */
  if (unrevealed) {
    const name = unrevealed.partner?.display_name ?? "your partner";
    return {
      mark: <TogetherAvatarStack people={partners(state)} />,
      headline: `Your Together with ${name} is ready`,
      detail: `${unrevealed.pick_count} Picks are waiting`,
      action: "Reveal",
      href: `/together/session/${encodeURIComponent(unrevealed.session_id)}`,
    };
  }

  if (state.current_sessions.length > 0) {
    const people = partners(state);
    return {
      mark: <TogetherAvatarStack people={people} />,
      headline: people.map((person) => person.displayName).join(" · "),
      detail:
        state.current_sessions.length === 1
          ? `${state.current_sessions[0].pick_count} Picks together`
          : `${state.current_sessions.length} sets today`,
      action: "View",
      href: "/together",
    };
  }

  if (state.session?.status === "pending") {
    return {
      mark: <TogetherAwaitingMark size="xs" />,
      headline: "Waiting for someone to join",
      detail: "Your invite is out.",
      action: "View",
      href: "/together",
    };
  }

  if (state.can_initiate) {
    return {
      mark: null,
      headline: "Find three Picks with someone.",
      detail: state.premium ? null : "Your first Together is included.",
      action: "Start Together",
      href: "/together",
    };
  }

  /*
   * Locked. The row still describes the feature, states the reason plainly and
   * offers nothing to tap: a link into a surface that can only repeat the same
   * sentence is a dead end, and neither lock is worth a sales pitch here.
   */
  if (state.block_reason === "ratings_required") {
    const remaining = Math.max(state.ratings_required - state.rated_visit_count, 0);
    return {
      mark: null,
      headline: "Find three Picks with someone.",
      detail: `Rate ${remaining} more visit${remaining === 1 ? "" : "s"} to unlock.`,
      action: null,
      href: "/together",
    };
  }

  if (state.block_reason === "premium_required") {
    return {
      mark: null,
      headline: "Find three Picks with someone.",
      detail: "Available with Fiyu Premium.",
      action: null,
      href: "/together",
    };
  }

  return null;
}

export function TogetherPicksEntry({ state }: { state: TogetherState }) {
  const content = entryContent(state);
  if (!content) return null;

  const body = (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {content.mark}
        <div className="min-w-0">
          <span className={cn(TOGETHER_CAPS, "block text-plum-700")}>Fiyu Together</span>
          <span className="mt-1 block truncate font-display text-lg leading-snug text-ink">
            {content.headline}
          </span>
          {content.detail ? (
            <span className="mt-0.5 block truncate text-xs text-ink-muted">{content.detail}</span>
          ) : null}
        </div>
      </div>
      {content.action ? (
        <span className="shrink-0 text-sm font-semibold whitespace-nowrap text-plum-700 group-hover:underline group-hover:decoration-plum-500 group-hover:underline-offset-4">
          {content.action} <span aria-hidden="true">→</span>
        </span>
      ) : null}
    </div>
  );

  return (
    <section
      aria-label="Fiyu Together"
      data-testid="together-picks-entry"
      className="my-6 sm:my-7"
    >
      {content.action ? (
        <Link
          href={content.href}
          className="group block min-h-11 rounded-card border border-plum-line bg-plum-50 px-4 py-3.5 transition-colors duration-[180ms] ease-(--ease-fiyu) hover:border-plum-500/40 hover:bg-plum-100/70 sm:px-5 sm:py-4"
        >
          {body}
        </Link>
      ) : (
        <div className="rounded-card border border-plum-line bg-plum-50 px-4 py-3.5 sm:px-5 sm:py-4">
          {body}
        </div>
      )}
    </section>
  );
}
