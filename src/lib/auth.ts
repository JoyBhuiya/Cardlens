import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { magicLink } from "better-auth/plugins/magic-link";
import { pool } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { signInEmail } from "@/lib/email/sign-in";
import { sendMail } from "@/lib/mail";

const LINK_MINUTES = 60;
/** Sign-in codes: 6 digits, valid 15 minutes, 5 wrong tries before the code is void. */
const CODE_MINUTES = 15;

/** Closed beta: addresses outside the allowlist get the same "check your inbox" screen but no mail. */
function mayReceiveSignIn(email: string): boolean {
  const allow = serverEnv.signInAllowlist();
  return allow.length === 0 || allow.includes(email.toLowerCase());
}

function createAuth() {
  const baseURL = serverEnv.siteUrl();
  return betterAuth({
    baseURL,
    secret: serverEnv.authSecret(),
    trustedOrigins: [baseURL],
    database: pool(),
    advanced: {
      database: { generateId: "uuid" },
      // The edge proxy sets X-Forwarded-For; the app is reachable only through it.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    rateLimit: {
      enabled: process.env.NODE_ENV === "production",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/magic-link": { window: 3600, max: 5 },
        "/email-otp/send-verification-otp": { window: 3600, max: 5 },
        "/sign-in/email-otp": { window: 900, max: 10 },
      },
    },
    plugins: [
      // Sign-in: a 6-digit code by email. The email's button opens /login/code with the code filled in; the
      // person presses "Sign in", so link scanners that fetch the page can't use the code up.
      emailOTP({
        otpLength: 6,
        expiresIn: CODE_MINUTES * 60,
        allowedAttempts: 5,
        storeOTP: "hashed",
        rateLimit: { window: 3600, max: 5 }, // per IP, same as the old magic-link limit
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "sign-in" || !mayReceiveSignIn(email)) return;
          const url = `${baseURL}/login/code?email=${encodeURIComponent(email)}&code=${otp}`;
          await sendMail({ to: email, ...signInEmail({ code: otp, url, minutes: CODE_MINUTES, siteHost: new URL(baseURL).host }) });
        },
      }),
      // Kept only so magic links sent before the switch to codes still verify; nothing sends new ones.
      magicLink({
        expiresIn: LINK_MINUTES * 60,
        sendMagicLink: async () => {
          throw new Error("Magic links are no longer sent; use the email code.");
        },
      }),
      nextCookies(), // must stay last
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { cardlensAuth?: Auth };

/** Created on first use, so a build without runtime secrets still succeeds. */
export function auth(): Auth {
  globalForAuth.cardlensAuth ??= createAuth();
  return globalForAuth.cardlensAuth;
}
