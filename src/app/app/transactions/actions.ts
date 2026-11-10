"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normaliseDescription } from "@/lib/pipeline/normalise";
import { requireUser } from "@/lib/supabase/server";

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
  const { supabase, user } = await requireUser();

  const { data: txn } = await supabase.from("transactions").select("merchant, description_raw, kind").eq("id", id).single();
  if (!txn) return { error: "Transaction not found." };

  const patch: Record<string, unknown> = {};
  if (category) {
    patch.category = category;
    patch.category_source = "user";
  }
  if (is_business !== undefined) patch.is_business = is_business;

  let updated = 0;
  if (applyToMerchant) {
    const { data } = await supabase
      .from("transactions")
      .update(patch)
      .eq("merchant", txn.merchant)
      .in("kind", ["purchase", "refund"])
      .select("id");
    updated = data?.length ?? 0;

    const pattern = rulePattern(txn.merchant, txn.description_raw);
    const { data: existing } = await supabase.from("merchant_rules").select("id, category, is_business").ilike("pattern", pattern).maybeSingle();
    const rule = {
      user_id: user.id,
      pattern,
      merchant: txn.merchant,
      category: category ?? existing?.category ?? null,
      is_business: is_business ?? existing?.is_business ?? null,
    };
    if (existing) await supabase.from("merchant_rules").update(rule).eq("id", existing.id);
    else await supabase.from("merchant_rules").insert(rule);
  } else {
    await supabase.from("transactions").update(patch).eq("id", id);
    updated = 1;
  }
  revalidatePath("/app", "layout");
  return { updated };
}
