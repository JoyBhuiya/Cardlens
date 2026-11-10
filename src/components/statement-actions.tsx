"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteStatement } from "@/app/app/actions";
import { Button } from "@/components/ui";

export function StatementActions({ id, canRetry }: { id: string; canRetry: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {canRetry ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch(`/api/statements/${id}/process`, { method: "POST" });
            setBusy(false);
            router.refresh();
          }}
        >
          {busy ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this statement and its transactions?")) return;
          start(async () => {
            await deleteStatement(id);
            router.refresh();
          });
        }}
      >
        Delete
      </Button>
    </div>
  );
}
