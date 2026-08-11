import type { Metadata } from "next";

import { DedicatedMap } from "@/components/destinations/DedicatedMap";

export const metadata: Metadata = { title: "Map" };

export default function MapPage() {
  return <DedicatedMap />;
}
