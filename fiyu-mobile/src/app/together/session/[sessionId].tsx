import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback } from "react";

import { TogetherSessionScreen } from "@/components/together/TogetherSessionScreen";

export default function TogetherSessionRoute() {
  const params = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] ?? "" : params.sessionId ?? "";
  const opened = useCallback((id: string) => router.replace(`/together?sessionId=${encodeURIComponent(id)}` as Href), []);
  return <TogetherSessionScreen sessionId={sessionId} onRevealed={opened} onBack={() => router.replace("/together" as Href)} />;
}
