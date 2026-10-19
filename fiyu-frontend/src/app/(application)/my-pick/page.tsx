import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "My Pick" };
export default async function MyPickPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { id } = await searchParams;
  redirect(typeof id === "string" && id ? `/picks?myPick=${encodeURIComponent(id)}` : "/picks");
}
