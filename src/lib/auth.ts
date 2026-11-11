import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { pool } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { sendMail } from "@/lib/mail";

const LINK_MINUTES = 60;

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
      customRules: { "/sign-in/magic-link": { window: 3600, max: 5 } },
    },
    plugins: [
      magicLink({
        expiresIn: LINK_MINUTES * 60,
        sendMagicLink: async ({ email, url }) => {
          // Closed beta: addresses outside the allowlist get the same "check your inbox" screen but no mail.
          const allow = serverEnv.signInAllowlist();
          if (allow.length > 0 && !allow.includes(email.toLowerCase())) return;
          await sendMail({
            to: email,
            subject: "Your Cardlens sign-in link",
            text: `Sign in to Cardlens:\n\n${url}\n\nThe link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.`,
            html: `<p>Sign in to Cardlens:</p><p><a href="${url}">Sign in</a></p><p>The link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.</p>`,
          });
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
