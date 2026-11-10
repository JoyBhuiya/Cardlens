"use client";

import { useActionState, useState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist";
import { Button, Input, Label } from "@/components/ui";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { id: "side_business", label: "My side business", confirm: "your side business" },
  { id: "personal", label: "Personal spending", confirm: "personal spending" },
  { id: "professional", label: "My clients (professional)", confirm: "your clients" },
] as const;

export function WaitlistForm() {
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]["id"]>("side_business");
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, { ok: false });
  const [reset, setReset] = useState(0);

  if (state.ok && reset === 0) {
    const chosen = SEGMENTS.find((s) => s.id === state.segment)?.confirm ?? "your cards";
    return (
      <div className="flex flex-col items-start gap-3" role="status" aria-live="polite">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="18" stroke="var(--brand)" strokeWidth="2.5" />
          <path d="M12 20.5l5.5 5.5L28 15" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 className="font-display text-[28px] font-bold">You&apos;re on the list</h2>
        <p className="text-base leading-relaxed text-muted">
          Thanks. We&apos;ve noted you&apos;d use Cardlens for {chosen}. We&apos;ll be in touch before early access opens.
        </p>
        <Button variant="secondary" type="button" onClick={() => setReset((n) => n + 1)}>
          Sign up another email
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[32px] font-bold">Join the waitlist</h2>
        <p className="text-base leading-relaxed text-muted">Be first to try Cardlens in January 2027, with an early-bird discount.</p>
      </div>
      <form key={reset} action={(fd) => { setReset(0); action(fd); }} className="flex flex-col gap-5" noValidate={false}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wl-email">Email address</Label>
          <Input id="wl-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </div>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[15px] font-semibold">I&apos;d use Cardlens for</legend>
          <input type="hidden" name="segment" value={segment} />
          <div className="flex flex-wrap gap-2.5">
            {SEGMENTS.map((s) => {
              const on = segment === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSegment(s.id)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 py-2.5 text-[15px] font-medium",
                    on ? "border-brand bg-brand text-white" : "border-border-strong bg-surface text-ink hover:bg-surface-2",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wl-cards">
            Which cards do you use? <span className="font-normal text-muted">(optional)</span>
          </Label>
          <Input id="wl-cards" name="cards" type="text" maxLength={200} placeholder="e.g. Amex, Barclaycard" />
        </div>
        {/* Honeypot: hidden from people and screen readers */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="wl-website">Website</label>
          <input id="wl-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        {state.error ? (
          <p role="alert" className="text-sm font-medium text-negative">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Joining…" : "Join the waitlist"}
        </Button>
        <p className="text-[13px] leading-normal text-muted">We&apos;ll only email you about Cardlens. Unsubscribe any time.</p>
      </form>
    </>
  );
}
