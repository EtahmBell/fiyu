import type { Metadata } from "next";
import { MyPickFlow } from "@/components/my-pick/MyPickFlow";

export const metadata: Metadata = { title: "My Pick" };
export default async function MyPickPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <MyPickFlow initialMyPickId={id ?? null} />;
}
