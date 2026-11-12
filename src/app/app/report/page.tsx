import { redirect } from "next/navigation";
import Link from "next/link";
import { EmptyState, PageHeader, buttonClasses } from "@/components/ui";
import { getYears } from "@/lib/data";
import { requireUser } from "@/lib/session";

export default async function ReportIndex() {
  const { db } = await requireUser();
  const years = await getYears(db);
  if (years.length) redirect(`/app/report/${years[0]}`);
  return (
    <>
      <PageHeader title="Annual report" />
      <EmptyState title="No data yet" body="Upload a year of statements to build your report." action={<Link href="/app/upload" className={buttonClasses("primary")}>Upload statements</Link>} />
    </>
  );
}
