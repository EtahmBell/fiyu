import { TogetherInvitePage } from "@/components/profile/TogetherInvitePage";

export default async function TogetherInvitationRoute({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ join?: string }> }) {
  const { token } = await params;
  const { join } = await searchParams;
  return <TogetherInvitePage token={token} autoJoin={join === "1"} />;
}
