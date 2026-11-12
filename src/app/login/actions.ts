"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";

export type LoginState = { sent?: boolean; email?: string; error?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.string().trim().toLowerCase().email().max(320).safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const nextRaw = String(formData.get("next") ?? "/app");
  const next = nextRaw.startsWith("/app") ? nextRaw : "/app";

  try {
    await auth().api.signInMagicLink({
      body: { email: email.data, callbackURL: next, errorCallbackURL: "/login?error=link" },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError && err.statusCode === 429) {
      return { error: "Please wait before requesting another link, or use the one we already sent." };
    }
    console.error("signInMagicLink failed", err instanceof Error ? err.message : err);
    return { error: "We couldn't send the email. Please try again." };
  }
  return { sent: true, email: email.data };
}
