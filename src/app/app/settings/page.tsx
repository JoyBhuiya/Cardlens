import type { Metadata } from "next";
import { Card, CardBody, CardHeader, CardTitle, Input, Label, PageHeader, Select, Table, Td, Th, buttonClasses } from "@/components/ui";
import { SettingsCardDelete, SettingsCategoryDelete, SettingsRuleDelete } from "@/components/settings-buttons";
import { cardLabel, getAllCategories, getCards } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { addCategory, deleteAllData } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { db, user } = await requireUser();
  const [cards, categories, rules] = await Promise.all([
    getCards(db),
    getAllCategories(db),
    db.query<{ id: string; pattern: string; merchant: string; category: string | null; is_business: boolean | null }>(
      "select id, pattern, merchant, category, is_business from merchant_rules order by created_at desc",
    ),
  ]);
  const custom = categories.filter((c) => !c.is_system);
  const catName = new Map(categories.map((c) => [c.slug, c.name]));

  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${user.email}`} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Cards</CardTitle>
          </CardHeader>
          <CardBody>
            {cards.length ? (
              <ul className="divide-y divide-border">
                {cards.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="font-medium">{cardLabel(c)}</span>
                    <SettingsCardDelete id={c.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No cards yet. Add one when you upload a statement.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your categories</CardTitle>
            <p className="text-sm text-muted">Add your own on top of the standard set.</p>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <form action={addCategory} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input id="cat-name" name="name" required maxLength={60} className="min-h-11 w-56" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat-group">Group</Label>
                <Select id="cat-group" name="group" defaultValue="lifestyle">
                  <option value="essentials">Essentials</option>
                  <option value="lifestyle">Lifestyle</option>
                  <option value="financial">Financial</option>
                </Select>
              </div>
              <button type="submit" className={buttonClasses("primary")}>Add category</button>
            </form>
            {custom.length ? (
              <ul className="flex flex-wrap gap-2">
                {custom.map((c) => (
                  <li key={c.slug} className="flex items-center gap-1 rounded-full border border-border py-1 pl-3 pr-1 text-sm">
                    {c.name}
                    <SettingsCategoryDelete slug={c.slug} name={c.name} />
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Remembered merchant rules</CardTitle>
            <p className="text-sm text-muted">Created when you choose &quot;All from this merchant&quot; on a transaction. Applied to future uploads first.</p>
          </CardHeader>
          <CardBody>
            {rules?.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>When description contains</Th>
                    <Th>Merchant</Th>
                    <Th>Category</Th>
                    <Th>Business</Th>
                    <Th><span className="sr-only">Actions</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <Td className="font-mono text-xs">{r.pattern}</Td>
                      <Td>{r.merchant}</Td>
                      <Td>{r.category ? catName.get(r.category) ?? r.category : "—"}</Td>
                      <Td>{r.is_business === null ? "—" : r.is_business ? "Yes" : "No"}</Td>
                      <Td className="text-right"><SettingsRuleDelete id={r.id} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-muted">No rules yet.</p>
            )}
          </CardBody>
        </Card>

        <Card className="border-negative/40">
          <CardHeader>
            <CardTitle>Delete all my data</CardTitle>
            <p className="text-sm text-muted">
              Permanently removes your statement files, transactions, reports, rules, cards and your account. This cannot be undone. Export a CSV first if you want a copy.
            </p>
          </CardHeader>
          <CardBody>
            <form action={deleteAllData} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm">Type DELETE to confirm</Label>
                <Input id="confirm" name="confirm" required pattern="DELETE" autoComplete="off" className="min-h-11 w-48" />
              </div>
              <button type="submit" className={buttonClasses("danger")}>Delete everything</button>
              <a href="/api/export/transactions" className={buttonClasses("secondary")}>Export CSV first</a>
            </form>
          </CardBody>
        </Card>

        <form action="/auth/signout" method="post">
          <button type="submit" className={buttonClasses("secondary")}>Sign out</button>
        </form>
      </div>
    </>
  );
}
