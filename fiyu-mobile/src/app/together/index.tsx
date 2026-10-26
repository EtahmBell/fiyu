import { router, type Href } from "expo-router";

import { TogetherHub } from "@/components/together/TogetherHub";

export default function TogetherScreen() {
  return <TogetherHub onBack={() => router.back()} onOpenSession={(sessionId) => router.push(`/together/session/${encodeURIComponent(sessionId)}` as Href)} onOpenRestaurant={(placeId) => router.push({ pathname: "/restaurants/[placeId]", params: { placeId } })} />;
}
