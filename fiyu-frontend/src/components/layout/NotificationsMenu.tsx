"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api/client";
import type { UserNotification } from "@/lib/api/schemas";
import { safeInternalPath } from "@/lib/navigation/safeRedirect";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

type NotificationState =
  | { status: "ready"; userId: string; items: UserNotification[] }
  | { status: "error"; userId: string };

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current">
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9ZM10 21h4" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function conciseDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationsMenu() {
  const router = useRouter();
  const identity = useProfileIdentity();
  const userId = identity.profile?.user_id ?? null;
  const [state, setState] = useState<NotificationState | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const current = userId && state?.userId === userId ? state : null;
  const items = current?.status === "ready" ? current.items : [];
  const unreadCount = items.reduce(
    (count, item) => count + (item.read_at === null ? 1 : 0),
    0,
  );

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void fetchNotifications({ signal: controller.signal })
      .then((notifications) => {
        if (!controller.signal.aborted) setState({ status: "ready", userId, items: notifications });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error", userId });
      });
    return () => controller.abort();
  }, [userId]);

  if (identity.status !== "ready" || !userId) return null;

  async function openNotification(notification: UserNotification) {
    let next = notification;
    if (notification.read_at === null) {
      try {
        next = await markNotificationRead(notification.id);
        setState((value) =>
          value?.status === "ready" && value.userId === userId
            ? { ...value, items: value.items.map((item) => (item.id === next.id ? next : item)) }
            : value,
        );
      } catch {
        return;
      }
    }
    const target = safeInternalPath(next.target_url, "");
    if (target) {
      if (detailsRef.current) detailsRef.current.open = false;
      router.push(target);
    }
  }

  async function markEverythingRead() {
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setState((value) =>
        value?.status === "ready" && value.userId === userId
          ? { ...value, items: value.items.map((item) => ({ ...item, read_at: item.read_at ?? readAt })) }
          : value,
      );
    } catch {
      // Preserve the server-backed unread state when the mutation fails.
    }
  }

  return (
    <details ref={detailsRef} className="group relative">
      <summary aria-label="Notifications" className="relative flex size-11 cursor-pointer list-none items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
        <BellIcon />
        {unreadCount > 0 && <span className="absolute top-2 right-2 flex size-2 rounded-full bg-rose-dust"><span className="sr-only">{unreadCount} unread notifications</span></span>}
      </summary>
      <div className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-surface shadow-xl">
        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-4">
          <p className="text-sm font-semibold text-ink">Notifications</p>
          {unreadCount > 0 && <button type="button" onClick={() => void markEverythingRead()} className="min-h-11 text-xs font-medium text-plum underline underline-offset-4">Mark all as read</button>}
        </div>
        {!current ? (
          <p role="status" className="px-4 py-6 text-sm text-ink-muted">Loading…</p>
        ) : current.status === "error" ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Notifications are unavailable right now.</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items.map((notification) => (
              <li key={notification.id}>
                <button type="button" onClick={() => void openNotification(notification)} className="flex min-h-20 w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle">
                  <span aria-hidden="true" className={`mt-1.5 size-1.5 shrink-0 rounded-full ${notification.read_at === null ? "bg-rose-dust" : "bg-transparent"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{notification.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{notification.body}</span>
                  </span>
                  <time dateTime={notification.created_at} className="shrink-0 text-[0.6875rem] text-ink-faint">{conciseDate(notification.created_at)}</time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
