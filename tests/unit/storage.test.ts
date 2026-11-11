import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { readStoredFile, removeFile, saveFile, sniffType } from "@/lib/storage";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const F = "33333333-3333-4333-8333-333333333333";

beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "cardlens-unit-"));
});

describe("storage", () => {
  it("round-trips a file inside the owner's folder", async () => {
    await saveFile(A, `${A}/${F}.csv`, new TextEncoder().encode("a,b\n"));
    expect((await readStoredFile(A, `${A}/${F}.csv`)).toString()).toBe("a,b\n");
    await removeFile(A, `${A}/${F}.csv`);
    await expect(readStoredFile(A, `${A}/${F}.csv`)).rejects.toThrow();
  });

  it("rejects another user's folder and path tricks", async () => {
    await expect(readStoredFile(B, `${A}/${F}.csv`)).rejects.toThrow(/Invalid file path/);
    await expect(readStoredFile(A, `${A}/../${B}/${F}.csv`)).rejects.toThrow(/Invalid file path/);
    await expect(readStoredFile(A, `${A}/${F}.exe`)).rejects.toThrow(/Invalid file path/);
  });

  it("detects PDFs by their magic bytes and rejects binary data as CSV", () => {
    expect(sniffType(new TextEncoder().encode("%PDF-1.7\n..."))).toBe("pdf");
    expect(sniffType(new TextEncoder().encode("Date,Amount\n"))).toBe("csv");
    expect(sniffType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBeNull();
    expect(sniffType(new Uint8Array([]))).toBeNull();
  });
});
