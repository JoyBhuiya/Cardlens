import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

const globalForStripe = globalThis as unknown as { cardlensStripe?: Stripe };

/** Server-only Stripe client (secret key never reaches the browser). Uses the library's pinned API version. */
export function stripe(): Stripe {
  globalForStripe.cardlensStripe ??= new Stripe(serverEnv.stripeSecretKey(), { maxNetworkRetries: 2, timeout: 20_000 });
  return globalForStripe.cardlensStripe;
}
