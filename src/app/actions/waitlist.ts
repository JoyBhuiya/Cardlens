"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  segment: z.enum(["side_business", "personal", "professional"]),
  cards: z.string().trim().max(200).optional(),
  website: z.string().max(0).optional(), // honeypot — real people leave it empty
});

export type WaitlistState = { ok: boolean; error?: string; segment?: string };

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
  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({ email, segment, cards: cards ?? null, source: "landing" });
  // Already on the list counts as success (and doesn't reveal who has signed up).
  if (error && error.code !== "23505") {
    console.error("waitlist insert failed", error.message);
    return { ok: false, error: "Something went wrong. Please try again in a moment." };
  }
  return { ok: true, segment };
}
