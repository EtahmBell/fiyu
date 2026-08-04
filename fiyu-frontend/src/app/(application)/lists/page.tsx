import type { Metadata } from "next";
import { TokyoListPage } from "@/components/lists/TokyoListPage";

export const metadata: Metadata = { title: "Lists" };

export default function ListsPage() {
  return <TokyoListPage />;
}
