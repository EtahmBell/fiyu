import { TogetherRevealPage } from "@/components/profile/TogetherRevealPage";

export default async function TogetherSessionRoute({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <TogetherRevealPage sessionId={sessionId} />;
}
