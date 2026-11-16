import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { Uploader } from "@/components/uploader";
import { getCards } from "@/lib/data";
import { getAccessCached } from "@/lib/entitlements";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Upload" };

export default async function UploadPage() {
  const { db } = await requireUser();
  const [cards, access] = await Promise.all([getCards(db), getAccessCached(db)]);
  return (
    <>
      <PageHeader
        title="Upload statements"
        description="Add up to 12 PDF or CSV statements at a time. Each file is read, checked against its balances and sorted in the background."
      />
      <Uploader initialCards={cards} maxCards={Number.isFinite(access.maxCards) ? access.maxCards : null} />
    </>
  );
}
