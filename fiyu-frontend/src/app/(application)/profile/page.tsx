import type { Metadata } from "next";

import { YourFiyuPage } from "@/components/profile/YourFiyuPage";

export const metadata: Metadata = {
  title: "Your Fiyu",
};

export default function ProfilePage() {
  return <YourFiyuPage />;
}
