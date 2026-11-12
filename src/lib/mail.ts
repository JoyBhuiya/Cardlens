import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { serverEnv } from "@/lib/env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends through Mailjet when its keys are set. Without them, MAIL_OUTBOX_DIR (development and e2e) receives
 * each message as a JSON file; with neither, production refuses and development prints the subject only.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const key = serverEnv.mailjetKey();
  const secret = serverEnv.mailjetSecret();
  if (key && secret) {
    const res = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: serverEnv.mailFrom(), Name: "Cardlens" },
            To: [{ Email: mail.to }],
            ...(serverEnv.mailReplyTo() ? { ReplyTo: { Email: serverEnv.mailReplyTo() } } : {}),
            Subject: mail.subject,
            TextPart: mail.text,
            HTMLPart: mail.html,
            // Transactional mail: no link rewriting (it would route one-time sign-in links through Mailjet
            // and let scanners use them up) and no tracking pixel. Both also count as spam signals.
            TrackClicks: "disabled",
            TrackOpens: "disabled",
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Never log the address or the body: the body carries a sign-in link.
      console.error("mailjet send failed", res.status);
      throw new Error("Mail could not be sent.");
    }
    return;
  }

  const outbox = serverEnv.mailOutboxDir();
  if (outbox) {
    await mkdir(outbox, { recursive: true });
    const file = path.join(outbox, `${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    await writeFile(file, JSON.stringify(mail), { mode: 0o600 });
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Mail is not configured (MAILJET_API_KEY / MAIL_OUTBOX_DIR).");
  console.warn(`[mail] not configured; dropped "${mail.subject}". Set MAIL_OUTBOX_DIR to capture mail locally.`);
}
