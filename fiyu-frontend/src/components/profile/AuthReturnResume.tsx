"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { authService } from "@/lib/auth/authService";
import { clearAuthReturnPath, pendingAuthReturnPath } from "@/lib/navigation/safeRedirect";

/** Resumes a safe stored destination when an email-verification callback lands without `next`. */
export function AuthReturnResume() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const destination = pendingAuthReturnPath();
    if (!destination || pathname === "/signin" || pathname === "/signup") return;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === destination) {
      clearAuthReturnPath();
      return;
    }
    void authService.getSession().then((session) => {
      if (!session) return;
      clearAuthReturnPath();
      router.replace(destination);
    }).catch(() => undefined);
  }, [pathname, router]);
  return null;
}
