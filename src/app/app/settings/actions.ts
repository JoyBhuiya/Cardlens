"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/billing/stripe";
import { requireUser } from "@/lib/session";
import { removeUserFiles } from "@/lib/storage";

export async function addCategory(formData: FormData) {
  const name = z.string().trim().min(1).max(60).safeParse(formData.get("name"));
  const group = z.enum(["essentials", "lifestyle", "financial"]).safeParse(formData.get("group"));
  if (!name.success || !group.success) return;
  const slug = `u_${name.data.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 36)}`;
  if (!/^[a-z0-9_]{2,40}$/.test(slug)) return;
  const { db, user } = await requireUser();
  await db.query(
    `insert into categories (user_id, slug, name, "group", is_system) values ($1, $2, $3, $4, false)
     on conflict do nothing`,
    [user.id, slug, name.data, group.data],
  );
  revalidatePath("/app", "layout");
}

export async function deleteCategory(slug: string) {
  if (!/^[a-z0-9_]{2,40}$/.test(slug)) return;
  const { db } = await requireUser();
  await db.tx(async (tx) => {
    await tx.query("update transactions set category = 'uncategorised', category_source = 'system' where category = $1", [slug]);
    await tx.query("update merchant_rules set category = null where category = $1", [slug]);
    await tx.query("delete from categories where slug = $1 and not is_system", [slug]);
  });
  revalidatePath("/app", "layout");
}

export async function deleteRule(id: string) {
  if (!z.string().uuid().safeParse(id).success) return;
  const { db } = await requireUser();
  await db.query("delete from merchant_rules where id = $1", [id]);
  revalidatePath("/app/settings");
}

/** Delete-all-my-data: statement files, then the user row; every table cascades from it (sessions included). */
export async function deleteAllData(formData: FormData) {
  if (formData.get("confirm") !== "DELETE") return;
  const { db, user } = await requireUser();
  // Stop any running subscription first, so nobody is charged for an account that no longer exists.
  // If Stripe can't be reached, keep the account and say so rather than leave a live subscription behind.
  const subs = await db.query<{ id: string }>(
    "select stripe_subscription_id as id from entitlements where stripe_subscription_id is not null and status in ('active', 'past_due')",
  );
  try {
    for (const s of subs) await stripe().subscriptions.cancel(s.id);
  } catch (err) {
    console.error("cancel subscription before delete failed", err instanceof Error ? err.message : err);
    redirect("/app/settings?error=billing");
  }
  await removeUserFiles(user.id);
  await auth()
    .api.signOut({ headers: await headers() })
    .catch(() => undefined);
  await db.query('delete from "user" where id = $1', [user.id]);
  redirect("/?deleted=1");
}
