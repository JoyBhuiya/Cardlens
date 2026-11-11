import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Signed-in journey: magic link (captured from MAIL_OUTBOX_DIR) → add card → upload the sample CSV →
 * transactions → annual report (template summary; no Claude key in tests) → delete all data.
 * scripts/verify.sh runs the server with MAIL_OUTBOX_DIR=E2E_OUTBOX_DIR.
 */
const outbox = process.env.E2E_OUTBOX_DIR;

async function magicLinkFor(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    for (const f of outbox ? await readdir(outbox).catch(() => []) : []) {
      const mail = JSON.parse(await readFile(path.join(outbox!, f), "utf8")) as { to: string; text: string };
      const url = mail.to === email ? /https?:\/\/\S+/.exec(mail.text)?.[0] : undefined;
      if (url) return url;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No sign-in mail for ${email}`);
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
  await page.goto(await magicLinkFor(email));
  await expect(page).toHaveURL(/\/app$/);
}

test.skip(!outbox, "needs E2E_OUTBOX_DIR (run through scripts/verify.sh)");

test("upload a CSV, see transactions and the annual report, then delete everything", async ({ page }, info) => {
  test.setTimeout(90_000);
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
  await signIn(page, email);

  await page.goto("/app/upload");
  await page.getByLabel("Issuer").selectOption("American Express");
  await page.getByRole("button", { name: "Save card" }).click();
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "../../fixtures/sample-amex.csv"));
  await page.getByRole("button", { name: /Process 1 file/ }).click();
  await expect(page.getByText("6 transactions, balances check out.")).toBeVisible({ timeout: 30_000 });

  await page.goto("/app/transactions?q=asos");
  await expect(page.getByText("2 transactions")).toBeVisible();

  await page.goto("/app/report/2026");
  await page.getByRole("button", { name: "Build report" }).click();
  await expect(page.getByRole("heading", { name: "Your card year 2026" })).toBeVisible({ timeout: 30_000 });

  const csv = await page.request.get("/api/export/transactions?year=2026");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("TESCO STORES 3042");

  await page.goto("/app/settings");
  await page.getByLabel(/Type DELETE/i).fill("DELETE");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});

test("signed-out API calls are refused", async ({ request }) => {
  expect((await request.post("/api/statements/upload")).status()).toBe(401);
  expect((await request.get("/api/export/transactions")).status()).toBe(401);
});
