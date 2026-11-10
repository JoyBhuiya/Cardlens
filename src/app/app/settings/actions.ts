"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export async function addCategory(formData: FormData) {
  const name = z.string().trim().min(1).max(60).safeParse(formData.get("name"));
  const group = z.enum(["essentials", "lifestyle", "financial"]).safeParse(formData.get("group"));
  if (!name.success || !group.success) return;
  const slug = `u_${name.data.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 36)}`;
  const { supabase, user } = await requireUser();
  await supabase.from("categories").insert({ user_id: user.id, slug, name: name.data, group: group.data, is_system: false });
  revalidatePath("/app", "layout");
}

export async function deleteCategory(slug: string) {
  const { supabase } = await requireUser();
  await supabase.from("transactions").update({ category: "uncategorised", category_source: "system" }).eq("category", slug);
  await supabase.from("merchant_rules").update({ category: null }).eq("category", slug);
  await supabase.from("categories").delete().eq("slug", slug).eq("is_system", false);
  revalidatePath("/app", "layout");
}

export async function deleteRule(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("merchant_rules").delete().eq("id", id);
  revalidatePath("/app/settings");
}

/** Delete-all-my-data: storage files, every row (cascade from auth.users) and the auth user itself. */
export async function deleteAllData(formData: FormData) {
  if (formData.get("confirm") !== "DELETE") return;
  const { supabase, user } = await requireUser();

  // 1. Storage: everything under <user_id>/ (paged).
  for (;;) {
    const { data: files } = await supabase.storage.from("statements").list(user.id, { limit: 100 });
    if (!files?.length) break;
    await supabase.storage.from("statements").remove(files.map((f) => `${user.id}/${f.name}`));
    if (files.length < 100) break;
  }

  // 2. Rows, explicitly (also covered by ON DELETE CASCADE).
  for (const table of ["reports", "transactions", "statements", "merchant_rules", "categories", "cards"] as const) {
    await supabase.from(table).delete().eq("user_id", user.id);
  }

  // 3. The auth user (needs the service role).
  await supabase.auth.signOut();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) console.error("deleteUser failed", error.message);
  redirect("/?deleted=1");
}
