import type { Metadata } from "next";

import { AuthPage } from "@/components/public-site/AuthPage";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return <AuthPage mode="signup" />;
}
