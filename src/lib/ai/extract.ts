import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./client";
import { serverEnv } from "@/lib/env";
import { StatementExtraction } from "@/lib/pipeline/schema";
import { EXTRACT_STATEMENT_PROMPT, EXTRACT_USER_PROMPT } from "@/prompts/extract-statement";

/** Send a statement PDF to Claude as a document block; returns schema-valid JSON. */
export async function extractStatementPdf(pdf: ArrayBuffer): Promise<{ data: StatementExtraction; model: string }> {
  const model = serverEnv.extractModel();
  const message = await anthropic().messages.parse({
    model,
    max_tokens: 16000,
    system: EXTRACT_STATEMENT_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") },
          },
          { type: "text", text: EXTRACT_USER_PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(StatementExtraction) },
  });

  if (message.stop_reason === "max_tokens") {
    throw new Error("This statement is too long to read in one pass. Try splitting the PDF or uploading the CSV export.");
  }
  const parsed = message.parsed_output;
  if (!parsed) throw new Error("Could not read this statement. Please check it is a credit card statement PDF.");
  // Validate again locally — the schema is the contract.
  return { data: StatementExtraction.parse(parsed), model };
}
