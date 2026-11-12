"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { anonDb } from "@/lib/db";
import { LIMITS } from "@/lib/env";
import { hashIp, takeRateLimit } from "@/lib/usage";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  segment: z.enum(["side_business", "personal", "professional"]),
  cards: z.string().trim().max(200).optional(),
  website: z.string().max(0).optional(), // honeypot — real people leave it empty
});

export type WaitlistState = { ok: boolean; error?: string; segment?: string };

/** The visitor address as set by the edge proxy (first X-Forwarded-For entry). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const parsed = Schema.safeParse({
    email: formData.get("email"),
    segment: formData.get("segment"),
    cards: formData.get("cards") || undefined,
    website: formData.get("website") || undefined,
  });
  if (!parsed.success) {
    // Bots that fill the honeypot get a fake success.
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { ok: true, segment: "personal" };
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const { email, segment, cards } = parsed.data;
  try {
    if (!(await takeRateLimit(`waitlist:${hashIp(await clientIp())}`, LIMITS.waitlistPerIpPerHour, 3600))) {
      return { ok: false, error: "Too many sign-ups from your network. Please try again in an hour." };
    }
    // Already on the list counts as success (and doesn't reveal who has signed up).
    await anonDb.query(
      "insert into waitlist (email, segment, cards, source) values ($1, $2, $3, 'landing') on conflict do nothing",
      [email, segment, cards ?? null],
    );
  } catch (err) {
    console.error("waitlist insert failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "Something went wrong. Please try again in a moment." };
  }
  return { ok: true, segment };
}
