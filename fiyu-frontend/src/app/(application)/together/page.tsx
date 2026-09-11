import { TogetherHub } from "@/components/profile/TogetherHub";

export default async function TogetherRoute({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { session } = await searchParams;
  return <TogetherHub initialSessionId={session} />;
}
