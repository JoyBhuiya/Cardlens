import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { Uploader } from "@/components/uploader";
import { getCards } from "@/lib/data";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Upload" };

export default async function UploadPage() {
  const { supabase, user } = await requireUser();
  const cards = await getCards(supabase);
  return (
    <>
      <PageHeader
        title="Upload statements"
        description="Add up to 12 PDF or CSV statements at a time. Each file is read, checked against its balances and sorted, one at a time."
      />
      <Uploader userId={user.id} initialCards={cards} />
    </>
  );
}
