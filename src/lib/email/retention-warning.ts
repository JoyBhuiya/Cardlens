// The "we'll delete your data" notice sent before an inactive account is removed. Pure, unit-tested.
// Same email-client rules as sign-in.ts: table layout, inline styles, no images, plain-text part.

export interface RetentionWarningEmail {
  subject: string;
  text: string;
  html: string;
}

const C = { brand: "#0e7c66", ink: "#0f1b2d", muted: "#4a5568", surface: "#ffffff", surface2: "#f5f7fa", border: "#e2e8f0" };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}

export function retentionWarningEmail({
  deleteOn,
  signInUrl,
  siteHost,
  inactiveMonths,
}: {
  deleteOn: Date;
  signInUrl: string;
  siteHost: string;
  inactiveMonths: number;
}): RetentionWarningEmail {
  const date = formatLongDate(deleteOn);
  const subject = `Your Cardlens data will be deleted on ${date}`;
  const text = [
    "Your Cardlens data will be deleted",
    "",
    `You haven't signed in to Cardlens for a while. To avoid keeping financial data longer than needed, we delete accounts ${inactiveMonths} months after the last sign-in.`,
    "",
    `On or after ${date} we will permanently delete your account, transactions, rules and reports.`,
    "",
    "To keep everything, just sign in before then:",
    signInUrl,
    "",
    "If you no longer need Cardlens, you don't have to do anything. You can also download your data from Settings first.",
    "",
    "Cardlens · " + siteHost,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en-GB">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.surface2};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface2};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
      <tr><td style="padding:0 4px 20px 4px;font-family:${FONT};">
        <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${C.brand};vertical-align:middle;"></span>
        <span style="font-size:20px;font-weight:700;color:${C.ink};vertical-align:middle;">&nbsp;Cardlens</span>
      </td></tr>
      <tr><td style="background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:32px;font-family:${FONT};color:${C.ink};">
        <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:700;">Your data will be deleted on ${escapeHtml(date)}</h1>
        <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;color:${C.muted};">You haven't signed in to Cardlens for a while. To avoid keeping financial data longer than needed, we delete accounts ${inactiveMonths} months after the last sign-in: your account, transactions, rules and reports.</p>
        <p style="margin:0 0 24px 0;font-size:16px;line-height:1.55;color:${C.muted};">To keep everything, just sign in before then.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="${C.brand}" style="border-radius:8px;background:${C.brand};">
            <a href="${escapeHtml(signInUrl)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">Sign in to keep my data</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:20px 4px 0 4px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted};">
        If you no longer need Cardlens, you don't have to do anything. You can download your data from Settings first.<br>
        Cardlens · ${escapeHtml(siteHost)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  return { subject, text, html };
}
