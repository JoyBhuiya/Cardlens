"use server";

import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { sent?: boolean; email?: string; error?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const nextRaw = String(formData.get("next") ?? "/app");
  const next = nextRaw.startsWith("/app") ? nextRaw : "/app";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: `${publicEnv.siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    console.error("signInWithOtp failed", error.message);
    return { error: error.status === 429 ? "Too many attempts. Please wait a minute and try again." : "We couldn't send the email. Please try again." };
  }
  return { sent: true, email: email.data };
}
