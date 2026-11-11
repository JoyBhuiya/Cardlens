import "server-only";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { serverEnv } from "@/lib/env";

// Statement files on local disk: <STORAGE_DIR>/<user_id>/<uuid>.<pdf|csv>. Stored paths are relative.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE_PATH = new RegExp(`^(${UUID})/${UUID}\\.(pdf|csv)$`);

function root(): string {
  return path.resolve(serverEnv.storageDir());
}

/** Resolves a stored path only if it has the expected shape and belongs to this user. */
function resolveOwned(userId: string, filePath: string): string {
  const m = FILE_PATH.exec(filePath);
  if (!m || m[1] !== userId) throw new Error("Invalid file path.");
  return path.join(root(), filePath);
}

export async function saveFile(userId: string, filePath: string, data: Uint8Array): Promise<void> {
  const full = resolveOwned(userId, filePath);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, data, { mode: 0o600, flag: "wx" });
}

export async function readStoredFile(userId: string, filePath: string): Promise<Buffer> {
  return readFile(resolveOwned(userId, filePath));
}

export async function removeFile(userId: string, filePath: string): Promise<void> {
  await unlink(resolveOwned(userId, filePath)).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
}

export async function removeUserFiles(userId: string): Promise<void> {
  if (!new RegExp(`^${UUID}$`).test(userId)) throw new Error("Invalid user id.");
  await rm(path.join(root(), userId), { recursive: true, force: true });
}

/** Checks the first bytes, not the name: PDFs start with %PDF-, CSVs must be text without NUL bytes. */
export function sniffType(data: Uint8Array): "pdf" | "csv" | null {
  if (data.length >= 5 && Buffer.from(data.subarray(0, 5)).toString("latin1") === "%PDF-") return "pdf";
  const head = data.subarray(0, 4096);
  if (head.length > 0 && !head.includes(0)) return "csv";
  return null;
}
