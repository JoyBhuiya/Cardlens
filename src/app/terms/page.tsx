import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of use" updated="10 November 2026">
      <p>These terms apply when you use Cardlens, operated by [Company name]. By signing in you agree to them.</p>
      <h2>What Cardlens does</h2>
      <p>
        Cardlens reads credit card statements you upload and produces a summary of your spending, payments, interest and fees, with budgeting ideas. It
        checks totals against each statement&apos;s balances and tells you when they do not match.
      </p>
      <h2>Not financial advice</h2>
      <p>
        Reports and saving ideas are general budgeting information based only on your statements. They are not financial, tax or legal advice and do not
        recommend any financial product. Check important figures against your original statements, and speak to a qualified adviser before making
        financial decisions.
      </p>
      <h2>Your responsibilities</h2>
      <ul>
        <li>Only upload statements that belong to you or that you are authorised to process.</li>
        <li>Keep access to your email account secure, as it is how you sign in.</li>
        <li>Do not try to disrupt the service, exceed upload limits or access other people&apos;s data.</li>
      </ul>
      <h2>Accuracy</h2>
      <p>
        We work hard to read statements correctly, and every statement is reconciled to its balances, but AI extraction can make mistakes. Statements
        marked &quot;Needs review&quot; should be checked before you rely on them.
      </p>
      <h2>Ending your use</h2>
      <p>You can delete your account and all data at any time from Settings. We may suspend accounts that misuse the service.</p>
      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for decisions you make based on a report. Nothing in these terms limits your statutory rights as a
        consumer. These terms are governed by the law of England and Wales.
      </p>
    </LegalLayout>
  );
}
