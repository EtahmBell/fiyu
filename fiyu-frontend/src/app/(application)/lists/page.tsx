import type { Metadata } from "next";
import { TokyoListPage } from "@/components/lists/TokyoListPage";

export const metadata: Metadata = { title: "Lists" };

function resolveInitialTab(value: string | string[] | undefined): "saved" | "smart" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "smart" ? "smart" : "saved";
}

export default function ListsPage({
  searchParams,
}: {
  searchParams?: { tab?: string | string[] };
}) {
  const params = searchParams ?? {};
  return <TokyoListPage initialTab={resolveInitialTab(params.tab)} />;
}
