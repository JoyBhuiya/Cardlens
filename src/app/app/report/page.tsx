import { redirect } from "next/navigation";
import Link from "next/link";
import { EmptyState, PageHeader, buttonClasses } from "@/components/ui";
import { getDataRange } from "@/lib/data";
import { requireUser } from "@/lib/session";

/** Opens the latest calendar year with data; the period picker on the report switches to tax years etc. */
export default async function ReportIndex() {
  const { db } = await requireUser();
  const { last } = await getDataRange(db);
  if (last) redirect(`/app/report/${last.slice(0, 4)}`);
  return (
    <>
      <PageHeader title="Annual report" />
      <EmptyState title="No data yet" body="Upload a year of statements to build your report." action={<Link href="/app/upload" className={buttonClasses("primary")}>Upload statements</Link>} />
    </>
  );
}
