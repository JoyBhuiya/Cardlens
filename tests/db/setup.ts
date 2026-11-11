import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Run the database tests through scripts/verify.sh (it starts Postgres).");
}
process.env.IP_HASH_SALT ??= "test-salt";
process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "cardlens-files-"));
