"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CardRow } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { removeFile } from "@/lib/storage";

const CardSchema = z.object({
  issuer: z.string().trim().min(1, "Choose the card issuer.").max(80),
  nickname: z.string().trim().max(80).optional(),
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Last 4 digits only.")
    .optional()
    .or(z.literal("")),
});

const Id = z.string().uuid();

export async function createCard(input: { issuer: string; nickname?: string; last4?: string }) {
  const parsed = CardSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the card details." };
  const { db, user } = await requireUser();
  try {
    const card = await db.one<CardRow>(
      "insert into cards (user_id, issuer, nickname, last4) values ($1, $2, $3, $4) returning id, issuer, nickname, last4",
      [user.id, parsed.data.issuer, parsed.data.nickname || null, parsed.data.last4 || null],
    );
    revalidatePath("/app", "layout");
    return { card };
  } catch (err) {
    console.error("createCard failed", err instanceof Error ? err.message : err);
    return { error: "Could not save the card." };
  }
}

export async function deleteCard(cardId: string) {
  if (!Id.safeParse(cardId).success) return;
  const { db, user } = await requireUser();
  const files = await db.query<{ file_path: string }>("select file_path from statements where card_id = $1 and file_path is not null", [cardId]);
  for (const f of files) await removeFile(user.id, f.file_path);
  await db.query("delete from cards where id = $1", [cardId]);
  revalidatePath("/app", "layout");
}

export async function deleteStatement(statementId: string) {
  if (!Id.safeParse(statementId).success) return;
  const { db, user } = await requireUser();
  const row = await db.one<{ file_path: string | null }>("select file_path from statements where id = $1", [statementId]);
  if (row?.file_path) await removeFile(user.id, row.file_path);
  await db.query("delete from statements where id = $1", [statementId]);
  revalidatePath("/app", "layout");
}
