"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LIMITS, serverEnv } from "@/lib/env";
import { requireUser } from "@/lib/supabase/server";

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

export async function createCard(input: { issuer: string; nickname?: string; last4?: string }) {
  const parsed = CardSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the card details." };
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("cards")
    .insert({ user_id: user.id, issuer: parsed.data.issuer, nickname: parsed.data.nickname || null, last4: parsed.data.last4 || null })
    .select("id, issuer, nickname, last4")
    .single();
  if (error) return { error: "Could not save the card." };
  revalidatePath("/app", "layout");
  return { card: data };
}

export async function deleteCard(cardId: string) {
  const { supabase } = await requireUser();
  const { data: files } = await supabase.from("statements").select("file_path").eq("card_id", cardId).not("file_path", "is", null);
  if (files?.length) await supabase.storage.from("statements").remove(files.map((f) => f.file_path as string));
  await supabase.from("cards").delete().eq("id", cardId);
  revalidatePath("/app", "layout");
}

const UploadSchema = z.object({
  cardId: z.string().uuid(),
  fileName: z.string().min(1).max(200),
  fileType: z.enum(["pdf", "csv"]),
  size: z.number().int().positive().max(LIMITS.maxFileBytes),
  keepFile: z.boolean().default(false),
});

/** Step 1: create the statements row and the storage path the browser uploads to. Enforces the daily limit. */
export async function createStatementUpload(input: z.input<typeof UploadSchema>) {
  const parsed = UploadSchema.safeParse(input);
  if (!parsed.success) return { error: "Only PDF or CSV files up to 10 MB." };
  const { supabase, user } = await requireUser();

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase.from("statements").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= serverEnv.uploadsPerDay()) {
    return { error: `You've reached the limit of ${serverEnv.uploadsPerDay()} uploads in 24 hours. Please try again tomorrow.` };
  }

  const path = `${user.id}/${randomUUID()}.${parsed.data.fileType}`;
  const { data, error } = await supabase
    .from("statements")
    .insert({
      user_id: user.id,
      card_id: parsed.data.cardId,
      file_path: path,
      file_name: parsed.data.fileName.replace(/[^\w.\- ()]/g, "_"),
      file_type: parsed.data.fileType,
      keep_file: parsed.data.keepFile,
      status: "uploaded",
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not start the upload." };
  return { id: data.id as string, path };
}

export async function markUploadFailed(statementId: string, message: string) {
  const { supabase } = await requireUser();
  await supabase.from("statements").update({ status: "failed", error: message.slice(0, 300), file_path: null }).eq("id", statementId);
}

export async function deleteStatement(statementId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("statements").select("file_path").eq("id", statementId).single();
  if (data?.file_path) await supabase.storage.from("statements").remove([data.file_path]);
  await supabase.from("statements").delete().eq("id", statementId);
  revalidatePath("/app", "layout");
}
