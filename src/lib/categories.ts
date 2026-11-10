/** Mirrors the system categories seeded in 0001_init.sql. */
export const SYSTEM_CATEGORIES = [
  { slug: "groceries", name: "Groceries", group: "essentials" },
  { slug: "utilities", name: "Utilities and bills", group: "essentials" },
  { slug: "transport", name: "Transport and fuel", group: "essentials" },
  { slug: "housing", name: "Housing", group: "essentials" },
  { slug: "health", name: "Health and pharmacy", group: "essentials" },
  { slug: "insurance", name: "Insurance", group: "essentials" },
  { slug: "education", name: "Education and childcare", group: "essentials" },
  { slug: "dining", name: "Dining out", group: "lifestyle" },
  { slug: "takeaway", name: "Takeaway and delivery", group: "lifestyle" },
  { slug: "shopping", name: "Shopping", group: "lifestyle" },
  { slug: "travel", name: "Travel", group: "lifestyle" },
  { slug: "entertainment", name: "Entertainment", group: "lifestyle" },
  { slug: "subscriptions", name: "Subscriptions", group: "lifestyle" },
  { slug: "personal_care", name: "Personal care", group: "lifestyle" },
  { slug: "gifts_charity", name: "Gifts and charity", group: "lifestyle" },
  { slug: "home", name: "Home and garden", group: "lifestyle" },
  { slug: "business", name: "Business costs", group: "financial" },
  { slug: "fees_interest", name: "Fees and interest", group: "financial" },
  { slug: "cash", name: "Cash", group: "financial" },
  { slug: "payments", name: "Card payments", group: "financial" },
  { slug: "refunds", name: "Refunds", group: "financial" },
  { slug: "transfers", name: "Balance transfers", group: "financial" },
  { slug: "uncategorised", name: "Uncategorised", group: "lifestyle" },
] as const;

/** Categories a merchant purchase can fall into (excludes the kind-driven ones). */
export const MERCHANT_CATEGORY_SLUGS = [
  "groceries", "utilities", "transport", "housing", "health", "insurance", "education",
  "dining", "takeaway", "shopping", "travel", "entertainment", "subscriptions",
  "personal_care", "gifts_charity", "home", "business", "uncategorised",
] as const;

const NAMES = new Map<string, string>(SYSTEM_CATEGORIES.map((c) => [c.slug, c.name]));

export function categoryName(slug: string, custom?: Map<string, string>): string {
  return custom?.get(slug) ?? NAMES.get(slug) ?? slug.replace(/_/g, " ");
}
