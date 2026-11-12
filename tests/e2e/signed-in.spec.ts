import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Signed-in journey: 6-digit code (captured from MAIL_OUTBOX_DIR) → add card → upload the sample CSV, read in
 * the background → transactions → report for a calendar year and a tax year (template summary; no Claude key
 * in tests) → data download → delete all data. Payments are off in verify, so every feature is unlocked.
 * scripts/verify.sh runs the server with MAIL_OUTBOX_DIR=E2E_OUTBOX_DIR.
 */
const outbox = process.env.E2E_OUTBOX_DIR;

async function signInMailFor(email: string): Promise<{ code: string; url: string }> {
  for (let i = 0; i < 20; i++) {
    for (const f of outbox ? await readdir(outbox).catch(() => []) : []) {
      const mail = JSON.parse(await readFile(path.join(outbox!, f), "utf8")) as { to: string; text: string };
      if (mail.to !== email) continue;
      const code = /sign-in code is: (\d{6})/.exec(mail.text)?.[1];
      const url = /https?:\/\/\S+\/login\/code\S*/.exec(mail.text)?.[0];
      if (code && url) return { code, url };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No sign-in mail for ${email}`);
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByText(/emailed a 6-digit code/)).toBeVisible();
  const { code } = await signInMailFor(email);
  await page.getByLabel("Sign-in code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
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
  // Read by the background worker; the page polls until it's done.
  await expect(page.getByText("6 transactions, balances check out.")).toBeVisible({ timeout: 30_000 });

  await page.goto("/app/transactions?q=asos");
  await expect(page.getByText("2 transactions")).toBeVisible();

  await page.goto("/app/report/2026");
  await page.getByRole("button", { name: "Build report" }).click();
  await expect(page.getByRole("heading", { name: "Your card year 2026" })).toBeVisible({ timeout: 30_000 });

  // Tax year 2025/26 (6 Apr 2025 – 5 Apr 2026) covers the same March 2026 lines.
  await page.goto("/app/report/tax-2025");
  await page.getByRole("button", { name: "Build report" }).click();
  await expect(page.getByRole("heading", { name: "Your card year: 2025/26 tax year" })).toBeVisible({ timeout: 30_000 });

  const mine = await page.request.get("/api/export/my-data");
  expect(mine.status()).toBe(200);
  expect((await mine.json()).transactions).toHaveLength(6);

  const csv = await page.request.get("/api/export/transactions?period=2026");
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
  expect((await request.get("/api/export/my-data")).status()).toBe(401);
  expect((await request.get("/api/statements/status?ids=00000000-0000-0000-0000-000000000000")).status()).toBe(401);
  expect((await request.post("/api/stripe/webhook", { data: "{}" })).status()).toBe(503); // not configured in verify
});

test("the emailed link opens a page that needs a click, so scanners can't use the code", async ({ page, request }, info) => {
  const email = `e2e-link-${info.project.name}-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByText(/emailed a 6-digit code/)).toBeVisible();
  const { url } = await signInMailFor(email);
  const local = new URL(url);
  // A scanner fetching the link must not sign anyone in or use the code up.
  expect((await request.get(local.pathname + local.search)).status()).toBe(200);
  await page.goto(local.pathname + local.search);
  await expect(page.getByLabel("Sign-in code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
});
