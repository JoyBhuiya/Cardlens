# Cardlens: product requirements

Status: live at https://cardlens.brightnext.eu with open sign-up and no payments (2026-11-12).
Architecture: [ARCHITECTURE.md](ARCHITECTURE.md). Design: [DESIGN.md](DESIGN.md). Open work: [tasks/todo.md](../tasks/todo.md).

## Problem
People in the UK who use credit cards have no simple way to see a year of card spending in one place. Bank
apps show months one at a time, mix purchases with payments and refunds, and hide interest and fees. Open
banking tools need a bank login, which many people won't give. Side-business owners who put business costs on
a personal card face the same problem at tax time.

## Product
Upload up to 12 months of credit card statements (PDF or CSV) and get one reconciled annual report:
- what you spent versus what you paid;
- where the money went (categories, merchants, subscriptions);
- what interest and fees cost;
- a short professional summary with costed ideas to save.

No bank login: you upload the statements yourself.

## Users (from the landing page)
| Segment | Need | Planned price |
|---|---|---|
| Side-business owners (sellers, freelancers, landlords) | Business vs personal split, expense summary by category, accountant-ready CSV, up to 3 cards | £29 per year |
| Personal use | A clear look back at a year: spend vs payments by month, top categories, merchants and subscriptions, interest and fees with saving ideas | £9 one-off report |
| Professionals (accountants, mortgage brokers, debt advisers) | Unlimited client reports, own branding on PDFs, bulk upload | £49 per seat per month |

Prices are shown on the landing page as "planned launch pricing". Nothing is charged yet (see Open decisions).

## What exists today
- **Landing page** with how it works, audiences and pricing, trust points, and a waitlist (email, segment, cards).
- **Sign-in** by emailed magic link (no passwords); open sign-up, with an optional allowlist.
- **Cards:** add cards (issuer, nickname, last 4 digits).
- **Upload:** up to 12 PDF or CSV files per batch, 10 MB each. Each file is read, checked and sorted one at a time,
  with progress per file. Files are deleted after a successful read unless the user chooses to keep them.
- **Reading:** PDFs are read by Claude into a fixed schema; CSVs are parsed with column detection.
- **Checking:** each statement is reconciled to the penny (opening + debits − credits = closing). A gap over
  £1 marks it "Needs review". Lines repeated across overlapping statements are imported once.
- **Sorting:** every line is classified (purchase, payment, refund, fee, interest, cash advance, balance transfer)
  and categorised (user rules → built-in merchant list → Claude). Recurring charges are detected (3+ months).
- **Statements page:** status per file, reconciliation result, retry for failed or interrupted files, delete.
- **Transactions page:** filter by month, card, type, category, business/personal and text; change a category or
  the business flag for one line or for every line from that merchant (remembered as a rule); CSV export.
- **Overview:** headline numbers, spend vs payments by month, top categories, recurring charges, and a prompt
  when statements need attention.
- **Insights** per year: month by month, spending by category, top merchants, recurring charges, business share,
  foreign-currency spend.
- **Annual report** per calendar year: headline numbers, an AI-written summary whose every £ figure is checked
  against the computed numbers (otherwise a template summary is used), costed saving ideas, PDF (print) and
  CSV download.
- **Settings:** cards, custom categories, remembered merchant rules, delete all my data.
- **Limits:** uploads per day and AI calls per user per month, plus a global daily AI cap.

## Principles
- **Numbers are computed, not generated.** Every figure comes from reconciled transactions in code; the model
  only writes words around them, and any £ figure it writes must be derivable from the metrics.
- **Privacy first.** No bank logins, card numbers cut to the last 4 digits on read, files deleted after
  processing, no trackers or third-party scripts, delete everything at any time.
- **Not financial advice.** Saving ideas are general budgeting information based only on the user's statements.
- **UK only for now:** GBP, UK date formats, UK issuers.

## Out of scope (today)
Bank connections (open banking), debit cards and current accounts, currencies other than GBP, multi-user
accounts or teams, the professional tier's branding and client management, mobile apps.

## Success measures (proposed, not yet tracked)
- Share of uploaded statements that reconcile without review.
- Time from first upload to a finished report.
- Waitlist sign-ups by segment; conversion from free to paid once payments exist.
- Claude cost per statement and per report (recorded in `usage_events`).

## Open decisions (owner)
- **Legal:** operating entity and seller of record, ICO registration, UK representative check, DPIA, final
  privacy and terms texts (placeholders remain).
- **Commercial:** which tiers launch first. The current recommendation is the £9 one-off report and £29 per
  year, with £49 parked. Also the free vs paid boundary (proposed: upload, reconciliation and transactions free;
  full report and exports paid).
- **Payments:** Stripe Checkout and webhooks, entitlements behind one `hasAccess()` check.
- **Pricing check:** measure the real cost per statement before fixing prices.
