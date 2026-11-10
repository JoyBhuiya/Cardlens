import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClasses } from "@/components/ui";
import { WaitlistForm } from "@/components/waitlist-form";

const SAMPLE_BARS = [
  { label: "Groceries", width: 86 },
  { label: "Travel", width: 64 },
  { label: "Dining out", width: 48 },
  { label: "Subscriptions", width: 30 },
];

const STEPS = [
  {
    step: "Step 1",
    title: "Upload your statements",
    body: "Drop in up to 12 months of PDF or CSV statements, across one or several cards.",
    icon: (
      <>
        <path d="M16 21V7M10 13l6-6 6 6" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 21v4h20v-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    step: "Step 2",
    title: "We check and sort every line",
    body: "Purchases, payments, refunds and fees are separated, categorised and reconciled to each statement's balance.",
    icon: (
      <>
        <path d="M7 16l6 6 12-12" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="3" width="26" height="26" rx="5" stroke="currentColor" strokeWidth="2.2" />
      </>
    ),
  },
  {
    step: "Step 3",
    title: "Get your report",
    body: "A professional summary of your year, where you spend most, and specific, costed ways to save. Download as PDF or CSV.",
    icon: (
      <>
        <rect x="6" y="3" width="20" height="26" rx="3" stroke="currentColor" strokeWidth="2.2" />
        <path d="M11 21v-4M16 21v-8M21 21v-6" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  },
];

const AUDIENCES = [
  {
    title: "Side-business owners",
    body: "Sellers, freelancers and landlords who put business costs on a personal card.",
    points: ["Business vs personal split", "Expense summary by category", "Accountant-ready CSV, up to 3 cards"],
    price: "£29",
    unit: "per year",
    featured: true,
  },
  {
    title: "Personal use",
    body: "Anyone who wants a clear look back at a year of card spending.",
    points: ["Spend vs payments, month by month", "Top categories, merchants and subscriptions", "Interest and fees, with savings ideas"],
    price: "£9",
    unit: "one-off report",
  },
  {
    title: "Professionals",
    body: "Accountants, mortgage brokers and debt advisers working with client statements.",
    points: ["Unlimited client reports", "Your branding on every PDF", "Bulk upload across banks"],
    price: "£49",
    unit: "per seat / month",
  },
];

const TRUST = [
  { title: "No bank login", body: "You upload statements yourself. We never connect to your accounts." },
  { title: "Files deleted after processing", body: "Statements are removed once your report is built. Delete everything at any time." },
  { title: "Card numbers masked", body: "Card and account numbers are hidden the moment a file is read." },
  { title: "Numbers you can trust", body: "Every total is reconciled against your statement balances." },
];

export default function Landing() {
  return (
    <div className="w-full bg-surface text-ink">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-4 px-6 py-[18px]" aria-label="Main">
          <Logo />
          <div className="flex flex-wrap items-center gap-4 text-[15px] sm:gap-6">
            <a href="#how" className="hidden text-muted sm:inline no-underline hover:text-ink">How it works</a>
            <a href="#who" className="hidden text-muted sm:inline no-underline hover:text-ink">Who it&apos;s for</a>
            <a href="#trust" className="hidden text-muted sm:inline no-underline hover:text-ink">Privacy</a>
            <Link href="/login" className="text-muted no-underline hover:text-ink">Sign in</Link>
            <a href="#waitlist" className={buttonClasses("primary", "md")}>Join the waitlist</a>
          </div>
        </nav>
      </header>

      <main id="main">
        <section id="top" className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-14 px-6 pb-[88px] pt-20">
          <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-6">
            <span className="self-start rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-strong">
              Early access from January 2027
            </span>
            <h1 className="font-display text-[clamp(36px,5vw,56px)] font-bold leading-[1.08] tracking-[-0.02em]">
              Your year on your credit card, explained.
            </h1>
            <p className="max-w-[540px] text-[19px] leading-relaxed text-muted">
              Upload your statements and get one clear report: what you spent versus what you paid, where your money really goes, and
              costed ways to save. No bank login needed.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#waitlist" className={buttonClasses("primary", "lg")}>Get early access</a>
              <a href="#how" className={buttonClasses("secondary", "lg")}>See how it works</a>
            </div>
            <p className="text-sm text-muted">Built for UK cards: Amex, Barclaycard, HSBC, Lloyds, NatWest and more.</p>
          </div>

          <div className="min-w-0 flex-[1_1_420px]">
            <div
              role="img"
              aria-label="Sample Cardlens annual report showing spend versus payments and top spending categories"
              className="flex flex-col gap-[22px] rounded-2xl border border-border bg-surface-2 p-7"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="font-display text-lg font-semibold">Your card year 2026</span>
                <span className="text-[13px] text-muted">Sample report</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Total spend", "£14,820"],
                  ["Payments made", "£13,950"],
                  ["Interest and fees", "£212"],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-3.5">
                    <span className="text-xs text-muted">{label}</span>
                    <span className="num font-display text-xl font-semibold">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-[13px] font-semibold text-muted">Where it went</span>
                <div className="flex flex-col gap-2.5">
                  {SAMPLE_BARS.map((b) => (
                    <div key={b.label} className="flex items-center gap-3">
                      <span className="w-[110px] text-sm">{b.label}</span>
                      <div className="h-2.5 flex-1 rounded-[5px] bg-border">
                        <div className="h-2.5 rounded-[5px] bg-brand" style={{ width: `${b.width}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-[10px] border border-border bg-surface p-4">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="mt-0.5 flex-none">
                  <path d="M10 2v4M10 14v4M2 10h4M14 10h4" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="10" cy="10" r="2.5" stroke="var(--brand)" strokeWidth="2" />
                </svg>
                <span className="text-sm leading-normal">
                  Savings idea: 3 subscriptions unused for 6+ months. Cancelling them saves £264 a year.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="border-y border-border bg-surface-2">
          <div className="mx-auto flex max-w-[1160px] flex-col gap-12 px-6 py-[88px]">
            <div className="flex max-w-[640px] flex-col gap-3">
              <h2 className="font-display text-[clamp(28px,3.5vw,40px)] font-bold tracking-[-0.01em]">How it works</h2>
              <p className="text-lg leading-relaxed text-muted">Three steps, a few minutes, and a report you&apos;d be happy to hand to your accountant.</p>
            </div>
            <div className="flex flex-wrap gap-6">
              {STEPS.map((s) => (
                <div key={s.step} className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5 rounded-[14px] border border-border bg-surface p-7">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">{s.icon}</svg>
                  <span className="text-sm font-semibold text-brand-strong">{s.step}</span>
                  <h3 className="font-display text-[22px] font-semibold">{s.title}</h3>
                  <p className="text-base leading-relaxed text-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="who" className="mx-auto flex max-w-[1160px] flex-col gap-12 px-6 py-[88px]">
          <div className="flex max-w-[640px] flex-col gap-3">
            <h2 className="font-display text-[clamp(28px,3.5vw,40px)] font-bold tracking-[-0.01em]">Who it&apos;s for</h2>
            <p className="text-lg leading-relaxed text-muted">Planned launch pricing. Waitlist members get first access and an early-bird discount.</p>
          </div>
          <div className="flex flex-wrap items-stretch gap-6">
            {AUDIENCES.map((a) => (
              <div
                key={a.title}
                className={`flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-[14px] p-7 ${a.featured ? "border-2 border-brand" : "border border-border"}`}
              >
                {a.featured ? (
                  <span className="self-start rounded-full bg-brand-soft px-2.5 py-1 text-[13px] font-semibold text-brand-strong">Most requested</span>
                ) : null}
                <h3 className="font-display text-[22px] font-semibold">{a.title}</h3>
                <p className="text-base leading-relaxed text-muted">{a.body}</p>
                <ul className="list-disc pl-5 text-[15px] leading-[1.8]">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <div className="mt-auto flex items-baseline gap-1.5">
                  <span className="font-display text-[32px] font-bold">{a.price}</span>
                  <span className="text-[15px] text-muted">{a.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="trust" className="bg-[#0F1B2D] text-white">
          <div className="mx-auto flex max-w-[1160px] flex-col gap-10 px-6 py-20">
            <h2 className="font-display text-[clamp(28px,3.5vw,40px)] font-bold tracking-[-0.01em]">Your data, handled with care</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-8">
              {TRUST.map((t) => (
                <div key={t.title} className="flex flex-col gap-2">
                  <span className="text-[17px] font-semibold">{t.title}</span>
                  <span className="text-[15px] leading-relaxed text-[#CBD5E1]">{t.body}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="waitlist" className="mx-auto max-w-[720px] px-6 py-24">
          <div className="relative flex flex-col gap-6 rounded-[18px] border border-border p-6 shadow-[0_10px_30px_rgba(15,27,45,0.06)] sm:p-10">
            <WaitlistForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1160px] flex-wrap justify-between gap-3 px-6 py-7 text-[13px] text-muted">
          <span>Cardlens is a working name. © 2026 [Company name]. Budgeting insights only, not financial advice.</span>
          <div className="flex gap-5">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="#top">Back to top</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
