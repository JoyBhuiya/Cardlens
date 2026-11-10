import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

let client: Anthropic | null = null;

/** Server-only Anthropic client. 55s timeout keeps us inside the 60s per-file budget. */
export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: serverEnv.anthropicKey(), timeout: 55_000, maxRetries: 1 });
  }
  return client;
}
