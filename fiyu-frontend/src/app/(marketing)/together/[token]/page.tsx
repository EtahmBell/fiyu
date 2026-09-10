import { TogetherInvitePage } from "@/components/profile/TogetherInvitePage";

export default async function TogetherInvitationRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TogetherInvitePage token={token} />;
}
