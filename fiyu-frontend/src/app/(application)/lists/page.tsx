import type { Metadata } from "next";
import { TokyoListPage } from "@/components/lists/TokyoListPage";

export const metadata: Metadata = { title: "Lists" };

function resolveInitialTab(value: string | string[] | undefined): "saved" | "mine" | "smart" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "smart" || raw === "mine" ? raw : "saved";
}

async function ListsPageWithResolvedParams({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const params = await searchParams;
  return <TokyoListPage initialTab={resolveInitialTab(params.tab)} />;
}

export default function ListsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[] }> | { tab?: string | string[] };
}) {
  if (searchParams instanceof Promise) {
    return <ListsPageWithResolvedParams searchParams={searchParams} />;
  }
  return <TokyoListPage initialTab={resolveInitialTab(searchParams?.tab)} />;
}
