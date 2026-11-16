import { AppHeader } from "@/components/navigation/AppHeader";

export function PicksHeader({ onOpenMenu }: { onOpenMenu(): void }) {
  return <AppHeader onOpenMenu={onOpenMenu} />;
}
