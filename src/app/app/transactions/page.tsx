import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader, Select, Table, Td, Th, buttonClasses, Input, Label } from "@/components/ui";
import { CategoryCell, BusinessCell } from "@/components/transaction-cells";
import { cardLabel, getAllCategories, getCards } from "@/lib/data";
import { formatPence } from "@/lib/money";
import { KIND_LABELS, TXN_KINDS } from "@/lib/types";
import { requireUser } from "@/lib/supabase/server";
import { formatDate, monthLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Transactions" };
const PAGE = 100;

type SP = { month?: string; card?: string; kind?: string; category?: string; business?: string; q?: string; page?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  let q = supabase
    .from("transactions")
    .select("id, card_id, posted_on, merchant, description_raw, amount_pence, direction, kind, category, is_business, is_recurring", { count: "exact" })
    .order("posted_on", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const [y, m] = sp.month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    q = q.gte("posted_on", `${sp.month}-01`).lte("posted_on", end);
  }
  if (sp.card) q = q.eq("card_id", sp.card);
  if (sp.kind && (TXN_KINDS as readonly string[]).includes(sp.kind)) q = q.eq("kind", sp.kind);
  if (sp.category) q = q.eq("category", sp.category);
  if (sp.business === "yes") q = q.eq("is_business", true);
  if (sp.business === "no") q = q.eq("is_business", false);
  if (sp.q) q = q.or(`merchant.ilike.%${sp.q.replace(/[%,()]/g, "")}%,description_raw.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);

  const [{ data, count }, cards, categories, { data: monthsData }] = await Promise.all([
    q,
    getCards(supabase),
    getAllCategories(supabase),
    supabase.from("transactions").select("posted_on").order("posted_on", { ascending: false }).limit(1),
  ]);
  const rows = data ?? [];
  const cardMap = new Map(cards.map((c) => [c.id, cardLabel(c)]));

  if (!rows.length && !Object.values(sp).some(Boolean)) {
    return (
      <>
        <PageHeader title="Transactions" />
        <EmptyState title="No transactions yet" body="Upload a statement to see every line here." action={<Link href="/app/upload" className={buttonClasses("primary")}>Upload statements</Link>} />
      </>
    );
  }

  // Month options: the 24 months up to the latest transaction
  const latest = monthsData?.[0]?.posted_on?.slice(0, 7);
  const monthOpts: string[] = [];
  if (latest) {
    const d = new Date(`${latest}-01T00:00:00Z`);
    for (let i = 0; i < 24; i++) {
      monthOpts.push(d.toISOString().slice(0, 7));
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
  }
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `?${p.toString()}`;
  };
  const catOptions = categories.map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <>
      <PageHeader
        title="Transactions"
        description={`${total.toLocaleString("en-GB")} transaction${total === 1 ? "" : "s"}`}
        actions={
          <a href={`/api/export/transactions${qs({ page: undefined })}`} className={buttonClasses("secondary")}>
            Export CSV
          </a>
        }
      />
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" method="get">
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-month" className="text-xs">Month</Label>
            <Select id="f-month" name="month" defaultValue={sp.month ?? ""}>
              <option value="">All</option>
              {monthOpts.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-card" className="text-xs">Card</Label>
            <Select id="f-card" name="card" defaultValue={sp.card ?? ""}>
              <option value="">All</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>{cardLabel(c)}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-kind" className="text-xs">Type</Label>
            <Select id="f-kind" name="kind" defaultValue={sp.kind ?? ""}>
              <option value="">All</option>
              {TXN_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-cat" className="text-xs">Category</Label>
            <Select id="f-cat" name="category" defaultValue={sp.category ?? ""}>
              <option value="">All</option>
              {catOptions.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-biz" className="text-xs">Business</Label>
            <Select id="f-biz" name="business" defaultValue={sp.business ?? ""}>
              <option value="">All</option>
              <option value="yes">Business only</option>
              <option value="no">Personal only</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-q" className="text-xs">Search</Label>
            <Input id="f-q" name="q" defaultValue={sp.q ?? ""} placeholder="Merchant…" className="min-h-11" />
          </div>
          <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
            <button type="submit" className={buttonClasses("primary", "sm")}>Apply filters</button>
            <Link href="/app/transactions" className={buttonClasses("ghost", "sm")}>Clear</Link>
          </div>
        </form>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Merchant</Th>
              <Th>Type</Th>
              <Th>Category</Th>
              <Th>Business</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <Td className="whitespace-nowrap">{formatDate(t.posted_on)}</Td>
                <Td>
                  <div className="font-medium">
                    {t.merchant}
                    {t.is_recurring ? <span className="ml-2 text-xs font-semibold text-brand">Recurring</span> : null}
                  </div>
                  <div className="max-w-xs truncate text-xs text-muted" title={t.description_raw}>
                    {t.description_raw} · {cardMap.get(t.card_id)}
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-muted">{KIND_LABELS[t.kind as keyof typeof KIND_LABELS]}</Td>
                <Td>
                  {t.kind === "purchase" || t.kind === "refund" ? (
                    <CategoryCell id={t.id} merchant={t.merchant} value={t.category} options={catOptions} />
                  ) : (
                    <span className="text-muted">{catOptions.find((c) => c.slug === t.category)?.name ?? t.category}</span>
                  )}
                </Td>
                <Td>{t.kind === "purchase" || t.kind === "refund" ? <BusinessCell id={t.id} merchant={t.merchant} value={t.is_business} /> : null}</Td>
                <Td className={`num whitespace-nowrap text-right font-semibold ${t.direction === "credit" ? "text-positive" : t.kind === "interest" || t.kind === "fee" ? "text-negative" : ""}`}>
                  {t.direction === "credit" ? "−" : ""}
                  {formatPence(t.amount_pence)}
                </Td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-muted">No transactions match these filters.</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={qs({ page: String(page - 1) })} className={buttonClasses("secondary", "sm")}>Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={qs({ page: String(page + 1) })} className={buttonClasses("secondary", "sm")}>Next</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
