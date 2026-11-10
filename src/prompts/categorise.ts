import { MERCHANT_CATEGORY_SLUGS } from "@/lib/categories";

/** prompts/categorise — Haiku-class prompt for merchants not in the dictionary. */
export const CATEGORISE_PROMPT = `You categorise UK card merchants for a personal budgeting report.
You receive a JSON list of {merchant, sample} where sample is one raw statement description.
Return one item per input merchant, keeping the merchant string exactly as given, with the single best category from:
${MERCHANT_CATEGORY_SLUGS.join(", ")}.
Guidance: supermarkets → groceries; restaurants, cafés, pubs → dining; food delivery → takeaway; energy, water, phone, broadband → utilities; rail, fuel, parking, taxis → transport; flights, hotels → travel; streaming and software memberships → subscriptions; software, hosting, postage and marketplace seller tools → business. If genuinely unclear, use uncategorised.`;
