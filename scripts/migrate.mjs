/**
 * Applies db/migrations/*.sql in order, once each, as the database owner (MIGRATION_DATABASE_URL).
 * If APP_DB_PASSWORD is set, (re)sets the password of the cardlens_app login role afterwards.
 * Usage: npm run db:migrate (locally) or `node scripts/migrate.mjs` inside the app image (deploy/ops.sh).
 * Plain JavaScript so it runs in the production image without a TypeScript toolchain.
 */
// @ts-check
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

/** @returns {Promise<void>} */
async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("Set MIGRATION_DATABASE_URL (owner connection string).");
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const { rows } = await client.query("select name from public.schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const appPassword = process.env.APP_DB_PASSWORD;
    if (appPassword) {
      await client.query(`alter role cardlens_app with login password ${client.escapeLiteral(appPassword)}`);
      console.log("cardlens_app password set");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
