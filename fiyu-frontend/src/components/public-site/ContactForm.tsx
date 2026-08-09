"use client";

import { useState } from "react";

import { getApiBaseUrl } from "@/lib/config/env";

const FIELD_CLASS =
  "mt-2 min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-lavender-500";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setSent(false);
    try {
      const response = await fetch(`${getApiBaseUrl()}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });
      if (!response.ok) {
        throw new Error("We couldn’t send your message. Please check the form and try again.");
      }
      setName("");
      setEmail("");
      setMessage("");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t send your message.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-12 max-w-xl space-y-6 border-t border-line pt-9 sm:mt-14 sm:pt-10">
      <div>
        <label htmlFor="contact-name" className="text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">Name</label>
        <input id="contact-name" required maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={FIELD_CLASS} />
      </div>
      <div>
        <label htmlFor="contact-email" className="text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">Email</label>
        <input id="contact-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={FIELD_CLASS} />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="contact-message" className="text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">Message</label>
          <span className="text-xs text-ink-faint">{message.length}/4000</span>
        </div>
        <textarea id="contact-message" required maxLength={4000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} className={`${FIELD_CLASS} resize-y py-3 leading-6`} />
      </div>
      {error && <p role="alert" className="text-sm leading-6 text-rose-dust">{error}</p>}
      {sent && <p role="status" className="border-l-2 border-lavender-500 bg-lavender-50 px-3 py-2.5 text-sm text-ink-muted">Thanks — your message has been sent.</p>}
      <button type="submit" disabled={submitting} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-plum px-6 text-sm font-medium text-white transition-colors hover:bg-lavender-700 disabled:opacity-50">
        {submitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
