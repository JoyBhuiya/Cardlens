"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser client — anon key only. Used for direct uploads to the private bucket (storage RLS applies). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
