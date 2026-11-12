import Papa from "papaparse";
import { NextResponse, type NextRequest } from "next/server";
import { categoryName } from "@/lib/categories";
import { cardLabel, getAllTransactions, getCards, getCustomCategoryNames } from "@/lib/data";
import { KIND_LABELS } from "@/lib/types";
import { userDb } from "@/lib/db";
import { getUser } from "@/lib/session";

export const runtime = "nodejs";

/** Accountant-ready CSV of the user's transactions. Optional ?year=, ?card=, ?kind=, ?category=, ?business= */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in", code: "unauthenticated" }, { status: 401 });
  const db = userDb(user.id);

  const sp = request.nextUrl.searchParams;
  const year = Number(sp.get("year")) || undefined;
  const [txns, cards, names] = await Promise.all([getAllTransactions(db, { year }), getCards(db), getCustomCategoryNames(db)]);
  const cardMap = new Map(cards.map((c) => [c.id, cardLabel(c)]));
  const month = sp.get("month");

  const rows = txns
    .filter((t) => (!month || t.posted_on.startsWith(month)) && (!sp.get("card") || t.card_id === sp.get("card")))
    .filter((t) => (!sp.get("kind") || t.kind === sp.get("kind")) && (!sp.get("category") || t.category === sp.get("category")))
    .filter((t) => (sp.get("business") === "yes" ? t.is_business : sp.get("business") === "no" ? !t.is_business : true))
    .map((t) => ({
      Date: t.posted_on,
      Card: cardMap.get(t.card_id) ?? "",
      Merchant: t.merchant,
      Description: t.description_raw,
      Type: KIND_LABELS[t.kind],
      Category: categoryName(t.category, names),
      Business: t.is_business ? "Yes" : "No",
      Recurring: t.is_recurring ? "Yes" : "No",
      // Signed: charges positive, payments and refunds negative
      "Amount (GBP)": ((t.direction === "credit" ? -1 : 1) * t.amount_pence / 100).toFixed(2),
    }));

  // Neutralise spreadsheet formula injection in text cells.
  const safe = rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^[=+\-@\t\r]/.test(v) && k !== "Amount (GBP)" ? `'${v}` : v])),
  );
  const csv = Papa.unparse(safe.length ? safe : [{ Date: "", Card: "", Merchant: "", Description: "", Type: "", Category: "", Business: "", Recurring: "", "Amount (GBP)": "" }]);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cardlens-transactions${year ? `-${year}` : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
