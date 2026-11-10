"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateReport } from "@/app/app/report/actions";
import { Button } from "@/components/ui";

export function GenerateReportButton({ year, label = "Build report" }: { year: number; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await generateReport(year);
            if (res && "error" in res && res.error) setError(res.error);
            router.refresh();
          })
        }
      >
        {pending ? "Writing your summary…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      Download PDF
    </Button>
  );
}
