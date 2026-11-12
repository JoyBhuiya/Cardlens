import { NextResponse } from "next/server";
import { userDb } from "@/lib/db";
import { getUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * "Download all my data" (UK GDPR access and portability). Free on every plan, unlike the accountant-ready CSV:
 * everything we hold about the signed-in user as one JSON file.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in", code: "unauthenticated" }, { status: 401 });
  const db = userDb(user.id);
  const [cards, statements, transactions, categories, rules, reports, plans] = await Promise.all([
    db.query("select id, issuer, nickname, last4, created_at from cards order by created_at"),
    db.query(
      `select id, card_id, file_name, file_type, status, issuer, period_start, period_end, opening_balance_pence, closing_balance_pence,
              total_debits_pence, total_credits_pence, reconciled, transaction_count, created_at
       from statements order by created_at`,
    ),
    db.query(
      `select id, statement_id, card_id, posted_on, description_raw, merchant, amount_pence, direction, kind, category, is_business,
              is_recurring, foreign_currency from transactions order by posted_on, id`,
    ),
    db.query("select slug, name, \"group\" from categories where not is_system order by name"),
    db.query("select pattern, merchant, category, is_business, created_at from merchant_rules order by created_at"),
    db.query("select period_key, metrics, summary, summary_source, created_at from reports order by period_key"),
    db.query("select plan, status, current_period_end, cancel_at_period_end, created_at from entitlements order by created_at"),
  ]);
  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      account: { email: user.email },
      note: "Amounts are in pence. Statement files are not included: they are deleted once read unless you chose to keep them.",
      cards,
      statements,
      transactions,
      custom_categories: categories,
      merchant_rules: rules,
      reports,
      plans,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cardlens-my-data.json"`,
      "Cache-Control": "no-store",
    },
  });
}
