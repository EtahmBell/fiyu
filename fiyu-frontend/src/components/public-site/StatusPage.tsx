"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { logClientEvent } from "@/lib/clientLog";
import { getApiBaseUrl } from "@/lib/config/env";
import { cn } from "@/lib/utils/cn";

type CheckState = "checking" | "online" | "unavailable";

async function reachable(url: string, headers?: HeadersInit): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(10_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function ServiceRow({ label, state }: { label: string; state: CheckState }) {
  const text = state === "checking" ? "Checking…" : state === "online" ? "Online" : "Unable to connect";
  return <div className="flex items-center justify-between gap-6 border-b border-line py-4"><dt className="font-medium text-ink">{label}</dt><dd className={state === "online" ? "text-ink-muted" : "text-rose-dust"}>{text}</dd></div>;
}

export function StatusPage() {
  const [api, setApi] = useState<CheckState>("checking");
  const [account, setAccount] = useState<CheckState>("checking");
  const [checking, setChecking] = useState(false);
  const [hostname, setHostname] = useState("");
  const [onlineHint, setOnlineHint] = useState("Online hint");
  const initiallyChecked = useRef(false);

  const runChecks = useCallback(async () => {
    setChecking(true);
    setApi("checking");
    setAccount("checking");
    const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    const [apiOnline, accountOnline] = await Promise.all([
      reachable(`${getApiBaseUrl()}/health`),
      supabaseOrigin && publishableKey
        ? reachable(`${supabaseOrigin}/auth/v1/health`, { apikey: publishableKey })
        : Promise.resolve(false),
    ]);
    setApi(apiOnline ? "online" : "unavailable");
    setAccount(accountOnline ? "online" : "unavailable");
    if (!apiOnline) logClientEvent("health.api.failed", { operation: "health", errorCode: "unavailable", route: "/health" });
    if (!accountOnline) logClientEvent("health.supabase.failed", { operation: "health", errorCode: "unavailable", route: "/auth/v1/health" });
    setChecking(false);
  }, []);

  useEffect(() => {
    const updateBrowserHint = () => {
      setHostname(window.location.hostname);
      setOnlineHint(navigator.onLine === false ? "Offline" : "Online hint");
    };
    void Promise.resolve().then(() => {
      updateBrowserHint();
      if (!initiallyChecked.current) {
        initiallyChecked.current = true;
        void runChecks();
      }
    });
    window.addEventListener("online", updateBrowserHint);
    window.addEventListener("offline", updateBrowserHint);
    return () => {
      window.removeEventListener("online", updateBrowserHint);
      window.removeEventListener("offline", updateBrowserHint);
    };
  }, [runChecks]);

  return (
    <main className="flex flex-1 items-start">
      <div className={cn(LANDING_MEASURE, "py-14 sm:py-20")}>
        <div className="mx-auto max-w-[34rem]">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-plum-700">Fiyu status</p>
          <h1 className="mt-3 font-display text-4xl text-ink">Connection status</h1>
          <dl className="mt-8 border-t border-line text-sm">
            <ServiceRow label="Website" state="online" />
            <ServiceRow label="Fiyu API" state={api} />
            <ServiceRow label="Account services" state={account} />
          </dl>
          <div className="mt-6 flex items-center justify-between gap-4 text-sm">
            <span className="text-ink-muted">Browser network: {onlineHint}</span>
            <button type="button" disabled={checking} onClick={() => void runChecks()} className="min-h-11 font-semibold text-plum underline underline-offset-4 disabled:opacity-50">Retry</button>
          </div>
          <p className="mt-8 text-sm leading-6 text-ink-muted">If Fiyu works on cellular but not Wi-Fi, the network may be blocking or misresolving the domain. This page can only run after the website itself loads.</p>
          <p className="mt-3 text-xs text-ink-faint">Hostname: {hostname}</p>
        </div>
      </div>
    </main>
  );
}
