import { afterEach, describe, expect, it, vi } from "vitest";
import { signInEmail } from "@/lib/email/sign-in";
import { sendMail } from "@/lib/mail";

const URL_WITH_PARAMS = "https://cardlens.example/login/code?email=a%40b.test&code=482913";

describe("sign-in email", () => {
  const mail = signInEmail({ code: "482913", url: URL_WITH_PARAMS, minutes: 15, siteHost: "cardlens.example" });

  it("shows the code in the subject, the HTML and the plain-text part", () => {
    expect(mail.subject).toBe("482913 is your Cardlens sign-in code");
    expect(mail.html).toContain(">482913</p>");
    expect(mail.text).toContain("Your sign-in code is: 482913");
  });

  it("links to the confirm page (escaped) in the button and the plain-text part", () => {
    const escaped = URL_WITH_PARAMS.replace(/&/g, "&amp;");
    expect(mail.html).toContain(`href="${escaped}"`);
    expect(mail.html).not.toContain("a%40b.test&code");
    expect(mail.text).toContain(URL_WITH_PARAMS);
  });

  it("states the expiry and how to ignore it, in both parts", () => {
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain("expires in 15 minutes");
      expect(body).toContain("you can ignore this email");
      expect(body).toContain("cardlens.example");
    }
  });

  it("uses no images, scripts or remote styles", () => {
    expect(mail.html).not.toMatch(/<img|<script|<link|<svg|url\(/i);
  });

  it("escapes HTML in the link, code and host", () => {
    const evil = signInEmail({ code: "<i>1</i>", url: 'https://x.test/?a="><script>', minutes: 5, siteHost: "<b>host</b>" });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).not.toContain("<b>host</b>");
    expect(evil.html).not.toContain("<i>1</i>");
    expect(evil.html).toContain("&quot;&gt;&lt;script&gt;");
  });
});

describe("sendMail via Mailjet", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ["MAILJET_API_KEY", "MAILJET_API_SECRET", "MAIL_FROM", "MAIL_REPLY_TO"]) delete process.env[k];
  });

  function stubFetch(status = 200) {
    const fetchMock = vi.fn(async () => new Response("{}", { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends with click and open tracking disabled, and a reply-to when set", async () => {
    Object.assign(process.env, { MAILJET_API_KEY: "k", MAILJET_API_SECRET: "s", MAIL_FROM: "no-reply@example.test", MAIL_REPLY_TO: "hello@example.test" });
    const fetchMock = stubFetch();
    await sendMail({ to: "a@example.test", subject: "S", text: "T", html: "<p>H</p>" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mailjet.com/v3.1/send");
    const msg = JSON.parse(String(init.body)).Messages[0];
    expect(msg).toMatchObject({
      From: { Email: "no-reply@example.test", Name: "Cardlens" },
      To: [{ Email: "a@example.test" }],
      ReplyTo: { Email: "hello@example.test" },
      TrackClicks: "disabled",
      TrackOpens: "disabled",
      TextPart: "T",
      HTMLPart: "<p>H</p>",
    });
  });

  it("omits reply-to when not set and throws a clean error when Mailjet refuses", async () => {
    Object.assign(process.env, { MAILJET_API_KEY: "k", MAILJET_API_SECRET: "s", MAIL_FROM: "no-reply@example.test" });
    const fetchMock = stubFetch(401);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(sendMail({ to: "a@example.test", subject: "S", text: "T", html: "H" })).rejects.toThrow("Mail could not be sent.");
    const msg = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).Messages[0];
    expect(msg).not.toHaveProperty("ReplyTo");
    expect(JSON.stringify(errors.mock.calls)).not.toContain("a@example.test");
    errors.mockRestore();
  });
});
