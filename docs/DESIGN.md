# Cardlens: design

Calm, precise, financial. One teal accent on navy text and white surfaces. Numbers are the hero: tabular,
right-aligned, and always in pounds and pence. Product scope: [PRD.md](PRD.md). System: [ARCHITECTURE.md](ARCHITECTURE.md).

## Sources of truth
| What | Where |
|---|---|
| Colour tokens (light, plus an unused dark set) | `design/tokens.css` |
| Tailwind mapping, fonts, radii, print rules | `src/app/globals.css` (`@theme inline`) |
| UI primitives | `src/components/ui/index.tsx` |
| Charts | `src/components/charts.tsx` (Recharts) |
| Logo | `src/components/logo.tsx` (inline SVG + wordmark) |
| Sign-in email | `src/lib/email/sign-in.ts` (inline styles, same palette) |

Use the Tailwind names (`bg-brand`, `text-muted`, `border-border` …), never raw hex, except in email and chart
code, which can't use CSS variables everywhere.

## Colour
| Token | Light | Use |
|---|---|---|
| `brand` | `#0e7c66` | primary buttons, links, focus ring, spend in charts |
| `brand-strong` | `#0a5c4c` | primary hover, brand text on `brand-soft` |
| `brand-soft` | `#e6f2ef` | highlighted panels, brand badges |
| `ink` | `#0f1b2d` | body text and headings |
| `navy` | `#1e3a5f` | payments in charts, secondary accent |
| `muted` | `#4a5568` | secondary text, table headers, axis labels |
| `surface` / `surface-2` | `#ffffff` / `#f5f7fa` | cards / page background, hover |
| `border` / `border-strong` | `#e2e8f0` / `#94a3b8` | dividers, cards / inputs, secondary buttons |
| `positive` / `negative` / `warning` | `#15803d` / `#b42318` / `#b45309` | reconciled, failed or money out, needs review |

Status colours are always paired with text ("Reconciled", "Needs review", "Failed"), never colour alone.
Category charts use a fixed teal-to-navy ramp (`DONUT` in `charts.tsx`), so categories never look like a warning.

**Dark mode:** `design/tokens.css` defines a `.dark` set and Tailwind has a `dark:` variant, but nothing applies
the class, so the app is light-only today. Wiring it up needs a toggle or `prefers-color-scheme` and a pass over
charts and the print styles.

## Typography
- **Inter Variable** for text and **Space Grotesk Variable** (`font-display`) for headings and big numbers. Both
  are self-hosted with `@fontsource`; there are no font requests to third parties.
- Page title (`PageHeader`): `font-display`, 24px, 30px from `sm`, bold. Card titles: 18px semibold.
- Landing hero: `clamp(36px, 5vw, 56px)`, tight leading and tracking. Section headings: `clamp(28px, 3.5vw, 40px)`.
- Body: 15–16px. Secondary text: `text-muted`. Table headers: 12px uppercase, wide tracking.
- **Numbers:** the `.num` class (tabular figures). Money always goes through `formatPence` (`src/lib/money.ts`):
  `£1,234.56`, or whole pounds with `{ whole: true }`. Lists show payments and refunds as negative amounts
  (`−£58.00`). Dates go through `formatDate` (`src/lib/utils.ts`) in UK order (`15 Mar 2026`).
- Measured contrast: white on `brand` 5.1:1, `muted` on white 7.5:1, `warning` on white 5.0:1 (all WCAG AA).

## Shape and spacing
- Radii: controls 8px, cards 14px (`--radius-control`, `--radius-card`), stat tiles 10px, badges fully round.
- Borders, not shadows: 1px `border` on cards and tables.
- Touch targets: buttons and inputs are at least 44px high (`min-h-11`, large `min-h-12`); small buttons are 36px.
- Content width: app pages max 1100px; landing sections max 1160px; prose max ~65ch (`max-w-prose`).

## Components (`src/components/ui`)
- **Button** / `buttonClasses(variant, size)`: `primary` (teal), `secondary` (bordered), `ghost`, `danger` (red,
  only for destructive actions such as "Delete everything"). Sizes `sm`, `md`, `lg`. Links styled as buttons use
  `buttonClasses` on an `<a>`.
- **Card** with `CardHeader`, `CardTitle`, `CardBody`.
- **Badge** tones: `neutral`, `brand`, `positive`, `negative`, `warning`.
- **Input**, **Select**, **Label**: labels are always visible (no placeholder-only fields).
- **Table**, `Th`, `Td`: amounts right-aligned with `.num`.
- **Stat**: a label plus a big number, optionally `positive` or `negative`.
- **PageHeader**: title, optional description and actions.
- **EmptyState**: a title, one sentence, and the next action ("Upload statements").
- **Skeleton**: a pulse placeholder while loading.

## Charts (`src/components/charts.tsx`)
- **Spend vs payments by month:** grouped bars. Spend is `brand`, payments `navy`, interest and fees `negative`
  (only shown when there are any).
- **Category donut** and **horizontal bar lists** for merchants.
- No animation (`isAnimationActive={false}`): numbers appear at once and print reliably. Axis labels use `muted`,
  gridlines use `border`, and tooltips use surface colours with an 8px radius. Every chart has its numbers in
  a table or list nearby.

## Layout
- **Landing:** a hero with a sample report card, How it works (3 steps), Who it's for (3 tiers, side business
  featured), trust points, and the waitlist.
- **App shell:** a sidebar from `lg` (248px, sticky) with logo, navigation (Overview, Upload, Statements,
  Transactions, Insights, Annual report, Settings), the user's email and Sign out. Below `lg` it becomes a top
  bar. Content sits on `surface-2`.
- **Responsive:** tested at 1440px and 375px (Playwright projects). No horizontal page scroll; wide tables scroll
  inside their card.

## Print and PDF
The report's "Download PDF" uses the browser's print to PDF. `@media print` in `globals.css` sets A4 with 16mm
margins, hides `.no-print` (navigation, buttons), forces white paper, and offers `.print-break` and
`.avoid-break` for page breaks.

## Writing
- UK English, plain words, short sentences. Say what happened and what to do next ("That link has expired or was
  already used. Request a new one below.").
- Never claim financial advice: saving ideas are budgeting suggestions with an estimated annual saving.
- Error messages never show internals. User-facing failures come from `UserError` or `LimitError` messages.

## Accessibility
- Skip link to `#main` on every page; one `h1` per page; `lang="en-GB"`.
- Visible focus ring: 2px `brand` outline with offset.
- Form errors use `role="alert"`, confirmations use `role="status"`.
- Icons from `lucide-react` are decorative next to text labels. Logo and chart SVGs are `aria-hidden` where text
  carries the meaning.
- Text colours on their backgrounds meet WCAG AA (see Typography for measured ratios).

## Email
The sign-in email follows the same palette in a table layout with inline styles: a teal wordmark, a white card
with a teal button, the full link as fallback, and a muted footer. It has no images or web fonts (email clients
block them, and they hurt deliverability), plus a plain-text part with the same content.
