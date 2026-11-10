import { createHash } from "node:crypto";
import { normaliseDescription } from "./normalise";
import type { Direction } from "@/lib/types";

/**
 * dedupe_hash = sha256(card, date, amount, direction, description, occurrence).
 * The occurrence index keeps two genuine identical coffees on the same day, while the same
 * line appearing again in an overlapping statement produces the same hash and is dropped.
 */
export function assignDedupeHashes<
  T extends { posted_on: string; amount_pence: number; direction: Direction; description_raw: string },
>(cardId: string, txns: T[]): (T & { dedupe_hash: string })[] {
  const seen = new Map<string, number>();
  return txns.map((t) => {
    const key = [cardId, t.posted_on, t.amount_pence, t.direction, normaliseDescription(t.description_raw)].join("|");
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const dedupe_hash = createHash("sha256").update(`${key}|${n}`).digest("hex");
    return { ...t, dedupe_hash };
  });
}
