import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { anonDb, pool, userDb } = await import("@/lib/db");
const { applyChange } = await import("@/lib/billing/apply");
const { getAccess } = await import("@/lib/entitlements");
const { createUser } = await import("./helpers");

let alice: string;
let bob: string;
const future = new Date(Date.now() + 30 * 86400_000).toISOString();

beforeAll(async () => {
  alice = await createUser();
  bob = await createUser();
});

afterAll(async () => {
  await anonDb.query('delete from "user" where id = any($1)', [[alice, bob]]);
  delete process.env.PAYMENTS_ENABLED;
  await pool().end();
});

describe("entitlements", () => {
  it("everyone has everything while payments are off", async () => {
    delete process.env.PAYMENTS_ENABLED;
    const a = await getAccess(userDb(alice));
    expect(a.can("csv_export")).toBe(true);
  });

  it("with payments on, a new user is on the free plan", async () => {
    process.env.PAYMENTS_ENABLED = "true";
    const a = await getAccess(userDb(alice));
    expect(a.plan).toBe("free");
    expect(a.can("full_report")).toBe(false);
  });

  it("a one-off purchase grants the personal plan; replaying the event changes nothing", async () => {
    process.env.PAYMENTS_ENABLED = "true";
    const change = {
      kind: "upsert_checkout" as const,
      userId: alice,
      plan: "personal" as const,
      checkoutSessionId: `cs_${alice}`,
      customerId: "cus_a",
      paymentIntentId: `pi_${alice}`,
      currentPeriodEnd: future,
    };
    await applyChange(change);
    await applyChange(change); // Stripe retry
    const rows = await userDb(alice).query("select plan from entitlements");
    expect(rows).toHaveLength(1);
    expect((await getAccess(userDb(alice))).plan).toBe("personal");
  });

  it("a subscription upgrades to side business and later updates in place", async () => {
    process.env.PAYMENTS_ENABLED = "true";
    const base = {
      kind: "upsert_subscription" as const,
      userId: alice,
      plan: "side_business" as const,
      subscriptionId: `sub_${alice}`,
      customerId: "cus_a",
      status: "active" as const,
      currentPeriodEnd: future,
      cancelAtPeriodEnd: false,
    };
    await applyChange(base);
    expect((await getAccess(userDb(alice))).plan).toBe("side_business");
    await applyChange({ ...base, status: "canceled" });
    const subs = await userDb(alice).query<{ status: string }>("select status from entitlements where stripe_subscription_id is not null");
    expect(subs).toEqual([{ status: "canceled" }]);
    expect((await getAccess(userDb(alice))).plan).toBe("personal"); // the one-off purchase still counts
  });

  it("a full refund ends one-off access", async () => {
    process.env.PAYMENTS_ENABLED = "true";
    await applyChange({ kind: "expire_payment", userId: alice, paymentIntentId: `pi_${alice}` });
    expect((await getAccess(userDb(alice))).plan).toBe("free");
  });

  it("users can't see or write each other's entitlements (RLS)", async () => {
    expect(await userDb(bob).query("select * from entitlements")).toEqual([]);
    await expect(
      userDb(bob).query("insert into entitlements (user_id, plan, status) values ($1, 'side_business', 'active')", [alice]),
    ).rejects.toThrow(/row-level security/);
    expect(await anonDb.query("select * from entitlements")).toEqual([]);
  });

  it("the app role can't delete purchase history", async () => {
    await expect(userDb(alice).query("delete from entitlements")).rejects.toThrow(/permission denied/);
  });
});
