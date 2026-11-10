/** npm run schemas — writes the JSON Schema contracts from the Zod sources of truth. */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { StatementExtraction } from "../src/lib/pipeline/schema";
import { AnnualSummary } from "../src/lib/summary/schema";

const dir = path.join(__dirname, "..", "schemas");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "statement-extraction.schema.json"), JSON.stringify(z.toJSONSchema(StatementExtraction), null, 2) + "\n");
fs.writeFileSync(path.join(dir, "annual-summary.schema.json"), JSON.stringify(z.toJSONSchema(AnnualSummary), null, 2) + "\n");
console.log("Wrote schemas/");
