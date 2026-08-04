import type { Metadata } from "next";

import { SmartViewDetailPage } from "@/components/lists/SmartViewDetailPage";

export const metadata: Metadata = { title: "Smart Views" };

export default async function SmartViewPage({
  params,
}: {
  params: Promise<{ viewKey: string }>;
}) {
  const { viewKey } = await params;
  return <SmartViewDetailPage viewKey={viewKey} />;
}
