// The sign-in (magic link) email. Pure function, no server imports, so it is unit-tested directly.
// Email-client rules: table layout, inline styles only, no images or web fonts (Gmail and Outlook block or
// strip them, and remote images hurt deliverability), and a plain-text part with the same content.

export interface SignInEmail {
  subject: string;
  text: string;
  html: string;
}

const C = {
  brand: "#0e7c66",
  brandSoft: "#e6f2ef",
  ink: "#0f1b2d",
  muted: "#4a5568",
  surface: "#ffffff",
  surface2: "#f5f7fa",
  border: "#e2e8f0",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function signInEmail({ url, minutes, siteHost }: { url: string; minutes: number; siteHost: string }): SignInEmail {
  const subject = "Your Cardlens sign-in link";
  const link = escapeHtml(url);
  const host = escapeHtml(siteHost);

  const text = [
    "Sign in to Cardlens",
    "",
    "Use this link to sign in. It works once and expires in " + minutes + " minutes:",
    "",
    url,
    "",
    "If you didn't ask to sign in, you can ignore this email. Nobody can sign in without this link.",
    "",
    "Cardlens · " + siteHost,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${C.surface2};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.surface2};">Your secure link to sign in to Cardlens. It expires in ${minutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface2};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td style="padding:0 4px 20px 4px;font-family:${FONT};">
            <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${C.brand};vertical-align:middle;"></span>
            <span style="font-size:20px;font-weight:700;color:${C.ink};vertical-align:middle;letter-spacing:-0.01em;">&nbsp;Cardlens</span>
          </td>
        </tr>
        <tr>
          <td style="background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:32px;font-family:${FONT};color:${C.ink};">
            <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:700;color:${C.ink};">Sign in to Cardlens</h1>
            <p style="margin:0 0 24px 0;font-size:16px;line-height:1.55;color:${C.muted};">Click the button to sign in. The link works once and expires in ${minutes} minutes.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="${C.brand}" style="border-radius:8px;background:${C.brand};">
                  <a href="${link}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">Sign in to Cardlens</a>
                </td>
              </tr>
            </table>
            <p style="margin:28px 0 8px 0;font-size:14px;line-height:1.5;color:${C.muted};">If the button doesn't work, copy this link into your browser:</p>
            <p style="margin:0;padding:12px;background:${C.brandSoft};border-radius:8px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${link}" style="color:${C.brand};text-decoration:underline;">${link}</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0 4px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted};">
            If you didn't ask to sign in, you can ignore this email. Nobody can sign in without this link.<br>
            Cardlens · ${host}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
