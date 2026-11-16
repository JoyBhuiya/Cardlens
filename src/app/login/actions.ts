"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";

export type LoginState = { sent?: boolean; email?: string; next?: string; error?: string };

const Email = z.string().trim().toLowerCase().email().max(320);
const Code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.");

function safeNext(raw: unknown): string {
  const s = String(raw ?? "/app");
  return s.startsWith("/app") && !s.startsWith("//") ? s : "/app";
}

function codeOf(err: unknown): string | undefined {
  if (!(err instanceof APIError)) return undefined;
  const body = err.body as { code?: string } | undefined;
  return body?.code;
}

/** Step 1: email a 6-digit code (and a link to /login/code with it filled in). */
export async function sendSignInCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = Email.safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const next = safeNext(formData.get("next"));
  try {
    await auth().api.sendVerificationOTP({ body: { email: email.data, type: "sign-in" }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError && err.statusCode === 429) {
      return { error: "Please wait before requesting another code, or use the one we already sent." };
    }
    console.error("send sign-in code failed", err instanceof Error ? err.message : err);
    return { error: "We couldn't send the email. Please try again." };
  }
  return { sent: true, email: email.data, next };
}

/** Step 2: check the code, start the session (cookie set by Better Auth's nextCookies plugin) and go in. */
export async function verifySignInCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = Email.safeParse(formData.get("email"));
  const code = Code.safeParse(String(formData.get("code") ?? "").replace(/\s/g, ""));
  const next = safeNext(formData.get("next"));
  if (!email.success) return { error: "Enter a valid email address." };
  if (!code.success) return { sent: true, email: email.data, next, error: code.error.issues[0]?.message };
  try {
    await auth().api.signInEmailOTP({ body: { email: email.data, otp: code.data }, headers: await headers() });
  } catch (err) {
    const c = codeOf(err);
    const error =
      err instanceof APIError && err.statusCode === 429
        ? "Too many tries. Please wait a few minutes."
        : c === "OTP_EXPIRED"
          ? "That code has expired. Request a new one."
          : c === "TOO_MANY_ATTEMPTS"
            ? "Too many wrong codes. Request a new one."
            : c === "INVALID_OTP"
              ? "That code isn't right. Check the latest email and try again."
              : "We couldn't sign you in. Please request a new code.";
    if (!c && !(err instanceof APIError)) console.error("verify sign-in code failed", err instanceof Error ? err.message : err);
    return { sent: true, email: email.data, next, error };
  }
  redirect(next);
}
