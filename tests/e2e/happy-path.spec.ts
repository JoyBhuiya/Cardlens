import { expect, test } from "@playwright/test";

/**
 * Happy path that runs without signing in: landing → waitlist → login → guarded /app.
 * The signed-in flow (upload → review → report) needs a test user; set E2E_EMAIL and use
 * Supabase's admin generateLink to sign in, then upload fixtures/sample-amex.csv.
 */

test("landing renders the approved sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your year on your credit card, explained.");
  for (const id of ["how", "who", "trust", "waitlist"]) await expect(page.locator(`#${id}`)).toBeVisible();
  await expect(page.getByText("£29")).toBeVisible();
});

test("waitlist sign-up shows confirmation", async ({ page }) => {
  await page.goto("/#waitlist");
  await page.getByLabel("Email address").fill(`e2e+${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Personal spending" }).click();
  await page.getByRole("button", { name: "Join the waitlist" }).last().click();
  await expect(page.getByText("You're on the list")).toBeVisible();
  await expect(page.getByText("personal spending")).toBeVisible();
});

test("app routes redirect to login when signed out", async ({ page }) => {
  await page.goto("/app/transactions");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Ftransactions/);
  await expect(page.getByRole("heading", { name: "Sign in to Cardlens" })).toBeVisible();
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["strict-transport-security"]).toContain("max-age=");
});
