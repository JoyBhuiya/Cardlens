import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  one: vi.fn(),
  query: vi.fn(),
  changeFromEvent: vi.fn(),
  applyChange: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ serverEnv: { stripeWebhookSecret: () => "whsec_test" } }));
vi.mock("@/lib/billing/stripe", () => ({
  stripe: () => ({ webhooks: { constructEvent: mocks.constructEvent }, subscriptions: {}, paymentIntents: {} }),
}));
vi.mock("@/lib/db", () => ({ anonDb: { one: mocks.one, query: mocks.query } }));
vi.mock("@/lib/billing/events", () => ({ changeFromEvent: mocks.changeFromEvent }));
vi.mock("@/lib/billing/apply", () => ({ applyChange: mocks.applyChange }));

import { POST } from "@/app/api/stripe/webhook/route";

const EVENT = { id: "evt_1", type: "checkout.session.completed" };

function post(signature: string | null = "t=1,v1=abc") {
  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
      headers: signature ? { "stripe-signature": signature } : {},
    }),
  );
}

const recorded = () => mocks.query.mock.calls.some(([sql]) => String(sql).includes("insert into stripe_events"));

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.constructEvent.mockReturnValue(EVENT);
    mocks.one.mockResolvedValue(null);
    mocks.changeFromEvent.mockResolvedValue({ kind: "expire_payment", userId: "u", paymentIntentId: "pi_1" });
    mocks.applyChange.mockResolvedValue(undefined);
  });

  it("applies the change and records the event", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, applied: true });
    expect(mocks.applyChange).toHaveBeenCalledOnce();
    expect(recorded()).toBe(true);
  });

  it("rejects a missing or invalid signature", async () => {
    expect((await post(null)).status).toBe(400);
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    expect((await post()).status).toBe(400);
    expect(mocks.applyChange).not.toHaveBeenCalled();
  });

  it("skips an event already applied", async () => {
    mocks.one.mockResolvedValue({ "?column?": 1 });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(mocks.changeFromEvent).not.toHaveBeenCalled();
  });

  it("answers 200 on an internal failure and leaves the event unrecorded so a resend applies it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.applyChange.mockRejectedValue(new Error("connection reset"));
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, applied: false });
    expect(recorded()).toBe(false);
    expect(log).toHaveBeenCalledWith("stripe webhook failed", "evt_1", EVENT.type, "connection reset");
    log.mockRestore();
  });

  it("acknowledges and records an event for a deleted account", async () => {
    mocks.applyChange.mockRejectedValue(new Error("violates foreign key constraint"));
    const res = await post();
    expect(res.status).toBe(200);
    expect(recorded()).toBe(true);
  });
});
