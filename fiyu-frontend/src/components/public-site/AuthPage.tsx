"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { authService } from "@/lib/auth/authService";
import { cn } from "@/lib/utils/cn";

const FIELD_CLASS =
  "mt-2 min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-lavender-500";

export function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const signup = mode === "signup";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    authService.getSession().then((session) => {
      if (active && session) router.replace("/picks");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  useEffect(() => authService.onPasswordRecovery(() => setPasswordRecovery(true)), []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const normalizedIdentifier = email.trim();
    const normalizedUsername = username.trim().replace(/^@+/, "");
    if (signup && !/^\S+@\S+\.\S+$/.test(normalizedIdentifier)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!signup && !normalizedIdentifier) {
      setError("Enter your email or username.");
      return;
    }
    if (signup && !/^[a-zA-Z0-9_]{3,30}$/.test(normalizedUsername)) {
      setError("Username must use 3–30 letters, numbers, or underscores.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (signup) {
        const result = await authService.signUp({
          email: normalizedIdentifier,
          password,
          username: normalizedUsername,
        });
        if (result.emailVerificationRequired) {
          setVerificationEmail(result.email);
        } else {
          router.replace("/picks");
        }
      } else {
        await authService.signIn({ identifier: normalizedIdentifier, password });
        router.replace("/picks");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account access is unavailable.");
    } finally {
      setSubmitting(false);
    }
  };

  const forgotPassword = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter your email address to reset your password.");
      return;
    }
    try {
      await authService.requestPasswordReset(email.trim());
      setError(null);
      setNotice("Check your email for a password reset link.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password reset is unavailable.");
    }
  };

  const resetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await authService.updatePassword(password);
      setNotice("Password updated. You can continue to Fiyu.");
      setPasswordRecovery(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password reset is unavailable.");
    } finally {
      setSubmitting(false);
    }
  };

  if (verificationEmail) {
    return (
      <main className="flex flex-1 items-start">
        <div className={cn(LANDING_MEASURE, "py-16 sm:py-24")}>
          <div className="mx-auto max-w-[28rem]">
            <p className="font-display text-2xl text-ink">Fiyu</p>
            <h1 className="mt-8 font-display text-4xl leading-tight text-ink sm:text-5xl">Check your email</h1>
            <p className="mt-5 text-base leading-8 text-ink-muted">
              We sent a verification link to:
            </p>
            <p className="mt-1 break-all text-base font-medium leading-7 text-ink">{verificationEmail}</p>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              Verify your email to finish creating your Fiyu account.
            </p>
            <Link href="/signin" className="mt-8 inline-flex min-h-11 items-center font-semibold text-plum underline underline-offset-4">
              Return to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (passwordRecovery) {
    return (
      <main className="flex flex-1 items-start">
        <div className={cn(LANDING_MEASURE, "py-16 sm:py-24")}>
          <form onSubmit={resetPassword} className="mx-auto max-w-[28rem]">
            <p className="font-display text-2xl text-ink">Fiyu</p>
            <h1 className="mt-8 font-display text-4xl leading-tight text-ink sm:text-5xl">Choose a new password</h1>
            <label htmlFor="recovery-password" className="mt-8 block text-sm font-medium text-ink">New password</label>
            <input id="recovery-password" type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={FIELD_CLASS} />
            {error && <p role="alert" className="mt-4 text-sm text-rose-dust">{error}</p>}
            <button type="submit" disabled={submitting} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-plum px-5 text-sm font-medium text-white disabled:opacity-50">
              {submitting ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-start">
      <div className={cn(LANDING_MEASURE, "py-14 sm:py-20 lg:py-24")}>
        <div className="mx-auto w-full max-w-[28rem]">
          <p className="font-display text-2xl text-ink">Fiyu</p>
          <h1 className="mt-8 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {signup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            {signup ? "Start your Fiyu account." : "Sign in to continue to Fiyu."}
          </p>
          {!authService.isConfigured() && (
            <p className="mt-6 border-l-2 border-lavender-500 bg-lavender-50 px-3 py-2.5 text-sm leading-6 text-ink-muted">
              Account access needs Supabase configuration before this form can be used.
            </p>
          )}

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor={`${mode}-email`} className="text-sm font-medium text-ink">
                {signup ? "Email" : "Email or username"}
              </label>
              <input
                id={`${mode}-email`}
                type={signup ? "email" : "text"}
                required
                autoComplete={signup ? "email" : "username"}
                placeholder={signup ? undefined : "Email or username"}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`${mode}-password`} className="text-sm font-medium text-ink">Password</label>
                {!signup && (
                  <button type="button" onClick={() => void forgotPassword()} className="min-h-11 text-xs font-medium text-plum underline underline-offset-4">
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id={`${mode}-password`}
                type="password"
                required
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            {signup && (
              <div>
                <label htmlFor="signup-username" className="text-sm font-medium text-ink">Username</label>
                <div className="relative mt-2">
                  <span aria-hidden="true" className="absolute inset-y-0 left-3 flex items-center text-sm text-ink-faint">@</span>
                  <input
                    id="signup-username"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={username}
                    onChange={(event) => setUsername(event.target.value.replace(/^@+/, ""))}
                    className="min-h-12 w-full rounded-lg border border-line bg-surface pr-3 pl-7 text-sm text-ink focus:border-lavender-500"
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-faint">Letters, numbers, and underscores.</p>
              </div>
            )}

            {error && <p role="alert" className="text-sm leading-6 text-rose-dust">{error}</p>}
            {notice && <p role="status" className="text-sm leading-6 text-ink-muted">{notice}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-plum px-5 text-sm font-medium text-white transition-colors hover:bg-lavender-700 disabled:opacity-50"
            >
              {submitting ? "Please wait…" : signup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-ink-muted">
            {signup ? "Already have an account?" : "New to Fiyu?"}{" "}
            <Link href={signup ? "/signin" : "/signup"} className="font-semibold text-plum underline underline-offset-4">
              {signup ? "Sign in" : "Sign up"}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
