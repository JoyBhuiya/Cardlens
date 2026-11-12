"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normaliseDescription } from "@/lib/pipeline/normalise";
import { requireUser } from "@/lib/session";

const Input = z.object({
  id: z.string().uuid(),
  category: z.string().regex(/^[a-z0-9_]{2,40}$/).optional(),
  is_business: z.boolean().optional(),
  applyToMerchant: z.boolean().default(false),
});

/** A rule pattern that appears in the raw description, so future imports match it. */
function rulePattern(merchant: string, raw: string): string {
  const norm = normaliseDescription(raw);
  const m = merchant.toUpperCase();
  if (norm.includes(m)) return m;
  const words = norm.replace(/[^A-Z0-9&' ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !/\d/.test(w));
  return words.slice(0, 2).join(" ") || norm.slice(0, 20);
}

/** Inline edit on the Transactions table; optionally applies to every transaction from this merchant and remembers it. */
export async function updateTransaction(input: z.input<typeof Input>) {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { error: "Invalid change." };
  const { id, category, is_business, applyToMerchant } = parsed.data;
  const { db, user } = await requireUser();

  const txn = await db.one<{ merchant: string; description_raw: string }>("select merchant, description_raw from transactions where id = $1", [id]);
  if (!txn) return { error: "Transaction not found." };

  // category_source changes only together with category; is_business only when given.
  const set = `category = coalesce($2, category),
               category_source = case when $2::text is null then category_source else 'user' end,
               is_business = coalesce($3, is_business)`;

  const updated = await db.tx(async (tx) => {
    if (!applyToMerchant) {
      await tx.query(`update transactions set ${set} where id = $1`, [id, category ?? null, is_business ?? null]);
      return 1;
    }
    const rows = await tx.query(`update transactions set ${set} where merchant = $1 and kind in ('purchase', 'refund') returning id`, [
      txn.merchant,
      category ?? null,
      is_business ?? null,
    ]);
    const pattern = rulePattern(txn.merchant, txn.description_raw);
    await tx.query(
      `insert into merchant_rules (user_id, pattern, merchant, category, is_business) values ($1, $2, $3, $4, $5)
       on conflict (user_id, lower(pattern)) do update
         set merchant = excluded.merchant,
             category = coalesce(excluded.category, merchant_rules.category),
             is_business = coalesce(excluded.is_business, merchant_rules.is_business)`,
      [user.id, pattern, txn.merchant, category ?? null, is_business ?? null],
    );
    return rows.length;
  });
  revalidatePath("/app", "layout");
  return { updated };
}
