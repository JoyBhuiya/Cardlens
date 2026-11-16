import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userDb } from "@/lib/db";
import { LIMITS } from "@/lib/env";
import { UserError } from "@/lib/errors";
import { getUser } from "@/lib/session";
import { removeFile, saveFile, sniffType } from "@/lib/storage";
import { enqueueStatement } from "@/lib/jobs";
import { assertUploadAllowance, recordUpload } from "@/lib/usage";

export const runtime = "nodejs";

const Fields = z.object({
  cardId: z.string().uuid(),
  keepFile: z.enum(["true", "false"]).transform((v) => v === "true"),
});

const err = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status });

/**
 * Step 1 of a statement: check limits, store the file under the user's folder, create the statements row and
 * queue it for the background worker. The browser then polls /api/statements/status.
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return err("Not signed in", "unauthenticated", 401);
  if (Number(request.headers.get("content-length") ?? 0) > LIMITS.maxFileBytes + 64 * 1024) {
    return err("Only PDF or CSV files up to 10 MB.", "too_large", 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return err("Upload could not be read.", "bad_request", 400);
  }
  const fields = Fields.safeParse({ cardId: form.get("cardId"), keepFile: form.get("keepFile") ?? "false" });
  const file = form.get("file");
  if (!fields.success || !(file instanceof File)) return err("Upload could not be read.", "bad_request", 400);
  if (file.size === 0 || file.size > LIMITS.maxFileBytes) return err("Only PDF or CSV files up to 10 MB.", "too_large", 413);

  const data = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(data);
  const named = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : file.name.toLowerCase().endsWith(".csv") ? "csv" : null;
  if (!type || type !== named) return err("Only PDF or CSV files up to 10 MB.", "bad_type", 415);

  const db = userDb(user.id);
  try {
    await assertUploadAllowance(db, user.id);
    const card = await db.one("select id from cards where id = $1", [fields.data.cardId]);
    if (!card) return err("Choose a card first.", "bad_card", 400);

    const filePath = `${user.id}/${randomUUID()}.${type}`;
    await saveFile(user.id, filePath, data);
    try {
      const row = await db.tx(async (tx) => {
        const created = await tx.one<{ id: string }>(
          `insert into statements (user_id, card_id, file_path, file_name, file_type, keep_file, status)
           values ($1, $2, $3, $4, $5, $6, 'uploaded') returning id`,
          [user.id, fields.data.cardId, filePath, file.name.slice(0, 200).replace(/[^\w.\- ()]/g, "_"), type, fields.data.keepFile],
        );
        await recordUpload(tx, user.id);
        return created;
      });
      if (row?.id) await enqueueStatement(db, user.id, row.id);
      return NextResponse.json({ id: row?.id, queued: true });
    } catch (e) {
      await removeFile(user.id, filePath);
      throw e;
    }
  } catch (e) {
    if (e instanceof UserError) return err(e.message, "limit", 429);
    console.error("upload failed", e instanceof Error ? e.message : e);
    return err("Upload failed. Please try again.", "internal", 500);
  }
}
