"use client";

import { useActionState } from "react";
import { sendSignInCode, verifySignInCode, type LoginState } from "./actions";
import { Button, Input, Label } from "@/components/ui";

/** Email → code. The second step is also reachable from the email's button (/login/code). */
export function LoginForm({ next }: { next: string }) {
  const [sent, sendAction, sending] = useActionState<LoginState, FormData>(sendSignInCode, {});
  if (sent.sent && sent.email) return <CodeForm email={sent.email} next={sent.next ?? next} />;
  return (
    <form action={sendAction} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      </div>
      {sent.error ? (
        <p role="alert" className="text-sm font-medium text-negative">
          {sent.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? "Sending…" : "Email me a sign-in code"}
      </Button>
    </form>
  );
}

export function CodeForm({ email, next, code = "", fromLink = false }: { email: string; next: string; code?: string; fromLink?: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(verifySignInCode, {});
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {fromLink ? null : (
        <div role="status" className="rounded-[10px] border border-border bg-brand-soft p-4 text-[15px]">
          We&apos;ve emailed a 6-digit code to <strong>{email}</strong>. It expires in 15 minutes.
        </div>
      )}
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Sign-in code</Label>
        <Input
          id="code"
          name="code"
          required
          defaultValue={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="123456"
          autoFocus={!code}
          className="text-center font-mono text-2xl tracking-[0.3em]"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-negative">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <a href={`/login${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-sm">
        Use a different email or get a new code
      </a>
    </form>
  );
}
