import "server-only";
import { cache } from "react";
import type { Db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { UserError } from "@/lib/errors";
import { accessFor, currentPlan, planName, planFor, type Access, type EntitlementRow, type Feature } from "@/lib/plans";

/** What the signed-in user's plan unlocks. `db` must be that user's userDb (RLS limits rows to them). */
export async function getAccess(db: Db): Promise<Access> {
  const rows = await db.query<EntitlementRow>("select plan, status, current_period_end from entitlements");
  return accessFor(currentPlan(rows), serverEnv.paymentsEnabled());
}

/** Per-request memo for server components: several components on one page ask for access once. */
export const getAccessCached = cache(getAccess);

/** A feature needs a paid plan; the message is shown to the user. */
export class UpgradeRequiredError extends UserError {
  constructor(feature: Feature) {
    super(`This needs the ${planName(planFor(feature))} plan. See Plan & billing to upgrade.`);
  }
}

export function assertCan(access: Access, feature: Feature): void {
  if (!access.can(feature)) throw new UpgradeRequiredError(feature);
}
