import { router, useLocalSearchParams, type Href } from "expo-router";

import { TogetherInviteScreen } from "@/components/together/TogetherInviteScreen";

export default function TogetherInviteRoute() {
  const params = useLocalSearchParams<{ token?: string | string[]; join?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] ?? "" : params.token ?? "";
  const join = Array.isArray(params.join) ? params.join[0] : params.join;
  return <TogetherInviteScreen token={token} autoJoin={join === "1"} onSignIn={(returnTo) => router.push({ pathname: "/(auth)/sign-in", params: { returnTo } })} onSignUp={(returnTo) => router.push({ pathname: "/(auth)/sign-up", params: { returnTo } })} onJoined={(sessionId) => router.replace(`/together/session/${encodeURIComponent(sessionId)}` as Href)} onGoToFiyu={() => router.replace("/")} />;
}
