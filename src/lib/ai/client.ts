import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

let client: Anthropic | null = null;

/** Server-only Anthropic client. 240s timeout keeps one attempt inside the 300s per-file budget. */
export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: serverEnv.anthropicKey(), timeout: 240_000, maxRetries: 0 });
  }
  return client;
}
