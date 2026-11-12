"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, FileUp } from "lucide-react";
import { createCard } from "@/app/app/actions";
import { Badge, Button, Card, CardBody, Input, Label, Select, buttonClasses } from "@/components/ui";
import { cn } from "@/lib/utils";

const ISSUERS = ["American Express", "Barclaycard", "HSBC", "Lloyds", "NatWest", "Halifax", "Santander", "Nationwide", "Capital One", "Virgin Money", "MBNA", "Tesco Bank", "John Lewis", "Monzo", "Other"];
const MAX_FILES = 12;
const MAX_BYTES = 10 * 1024 * 1024;

type CardOpt = { id: string; issuer: string; nickname: string | null; last4: string | null };
type Item = {
  key: string;
  file: File;
  state: "queued" | "uploading" | "reading" | "parsed" | "needs_review" | "failed";
  message?: string;
  count?: number;
};

const label = (c: CardOpt) => `${c.nickname || c.issuer}${c.last4 ? ` ••${c.last4}` : ""}`;

function fileType(f: File): "pdf" | "csv" | null {
  const n = f.name.toLowerCase();
  if (f.type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".csv") || f.type === "text/csv") return "csv";
  return null;
}

export function Uploader({ initialCards }: { initialCards: CardOpt[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [cardId, setCardId] = useState(initialCards[0]?.id ?? "");
  const [adding, setAdding] = useState(initialCards.length === 0);
  const [cardErr, setCardErr] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [keepFiles, setKeepFiles] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    setItems((list) => {
      const room = MAX_FILES - list.filter((i) => i.state === "queued").length;
      return [
        ...list,
        ...arr.slice(0, Math.max(room, 0)).map((file) => {
          const type = fileType(file);
          const bad = !type ? "Only PDF or CSV files." : file.size > MAX_BYTES ? "Larger than 10 MB." : undefined;
          return { key: `${file.name}-${file.size}-${Math.random()}`, file, state: bad ? "failed" : "queued", message: bad } as Item;
        }),
      ];
    });
  }, []);

  async function onAddCard(form: FormData) {
    setCardErr(null);
    const res = await createCard({
      issuer: String(form.get("issuer") ?? ""),
      nickname: String(form.get("nickname") ?? ""),
      last4: String(form.get("last4") ?? ""),
    });
    if ("error" in res && res.error) return setCardErr(res.error);
    if ("card" in res && res.card) {
      setCards((c) => [...c, res.card as CardOpt]);
      setCardId(res.card.id);
      setAdding(false);
    }
  }

  async function processAll() {
    if (!cardId) return;
    setBusy(true);
    const queue = items.filter((i) => i.state === "queued");
    for (const item of queue) {
      const type = fileType(item.file)!;
      update(item.key, { state: "uploading", message: "Uploading securely…" });
      const form = new FormData();
      form.set("cardId", cardId);
      form.set("keepFile", String(keepFiles));
      form.set("file", item.file);
      let id: string;
      try {
        const res = await fetch("/api/statements/upload", { method: "POST", body: form });
        const body = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !body.id) {
          update(item.key, { state: "failed", message: body.error ?? "Upload failed. Please try again." });
          continue;
        }
        id = body.id;
      } catch {
        update(item.key, { state: "failed", message: "Upload failed. Please try again." });
        continue;
      }
      update(item.key, { state: "reading", message: type === "pdf" ? "Reading every line…" : "Reading CSV…" });
      try {
        const res = await fetch(`/api/statements/${id}/process`, { method: "POST" });
        const body = (await res.json()) as { status: Item["state"]; transactionCount: number; issues: string[]; error?: string };
        update(item.key, {
          state: body.status,
          count: body.transactionCount,
          message:
            body.status === "failed"
              ? body.error ?? "Could not read this file."
              : body.status === "needs_review"
                ? body.issues[0] ?? "Totals don't match the statement balances."
                : `${body.transactionCount} transactions, balances check out.`,
        });
      } catch {
        update(item.key, { state: "failed", message: "Processing timed out. Try again from Statements." });
      }
    }
    setBusy(false);
    router.refresh();
  }

  const queued = items.filter((i) => i.state === "queued").length;
  const done = items.some((i) => i.state === "parsed" || i.state === "needs_review");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">1. Which card are these statements for?</h2>
          {cards.length > 0 && !adding ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="card">Card</Label>
                <Select id="card" value={cardId} onChange={(e) => setCardId(e.target.value)} className="min-w-64">
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {label(c)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button variant="secondary" type="button" onClick={() => setAdding(true)}>
                Add another card
              </Button>
            </div>
          ) : (
            <form action={onAddCard} className="grid gap-4 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
              <div className="flex flex-col gap-2">
                <Label htmlFor="issuer">Issuer</Label>
                <Select id="issuer" name="issuer" required defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {ISSUERS.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="nickname">
                  Nickname <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input id="nickname" name="nickname" maxLength={80} placeholder="e.g. Business Amex" className="min-h-11" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="last4">
                  Last 4 <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input id="last4" name="last4" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="1234" className="min-h-11" />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Save card</Button>
                {cards.length > 0 ? (
                  <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
              {cardErr ? (
                <p role="alert" className="text-sm text-negative sm:col-span-4">
                  {cardErr}
                </p>
              ) : null}
              <p className="text-[13px] text-muted sm:col-span-4">We only ever store the last 4 digits of a card number.</p>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-semibold">2. Add statement files</h2>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-[14px] border-2 border-dashed px-6 py-10 text-center",
              dragOver ? "border-brand bg-brand-soft" : "border-border-strong/50 bg-surface-2",
            )}
          >
            <FileUp size={32} className="text-brand" aria-hidden="true" />
            <p className="text-[15px]">
              Drag and drop up to {MAX_FILES} PDF or CSV statements, or{" "}
              <button type="button" className="font-semibold text-brand underline" onClick={() => inputRef.current?.click()}>
                choose files
              </button>
              .
            </p>
            <p className="text-[13px] text-muted">10 MB per file. Overlapping statements are fine — duplicates are dropped.</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.csv,application/pdf,text/csv"
              className="sr-only"
              aria-label="Choose statement files"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" checked={keepFiles} onChange={(e) => setKeepFiles(e.target.checked)} className="size-5 accent-[var(--brand)]" />
            Keep my original files after processing <span className="text-muted">(off by default — files are deleted once read)</span>
          </label>

          {items.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border" aria-live="polite">
              {items.map((i) => (
                <li key={i.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <StatusIcon state={i.state} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{i.file.name}</span>
                  <span className={cn("text-sm", i.state === "failed" ? "text-negative" : i.state === "needs_review" ? "text-warning" : "text-muted")}>
                    {i.message ?? "Ready"}
                  </span>
                  {i.state === "queued" ? (
                    <button type="button" className="text-sm font-semibold text-muted hover:text-ink" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}>
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" disabled={!cardId || queued === 0 || busy || adding} onClick={processAll}>
              {busy ? "Processing…" : `Process ${queued || ""} file${queued === 1 ? "" : "s"}`}
            </Button>
            {done && !busy ? (
              <>
                <Link href="/app/statements" className={buttonClasses("secondary", "lg")}>
                  Review statements
                </Link>
                <Link href="/app" className={buttonClasses("ghost", "lg")}>
                  See overview
                </Link>
              </>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function StatusIcon({ state }: { state: Item["state"] }) {
  switch (state) {
    case "parsed":
      return <CheckCircle2 size={20} className="text-positive" aria-label="Done" />;
    case "needs_review":
      return <AlertTriangle size={20} className="text-warning" aria-label="Needs review" />;
    case "failed":
      return <XCircle size={20} className="text-negative" aria-label="Failed" />;
    case "uploading":
    case "reading":
      return <Loader2 size={20} className="animate-spin text-brand" aria-label="In progress" />;
    default:
      return <Badge>Queued</Badge>;
  }
}
