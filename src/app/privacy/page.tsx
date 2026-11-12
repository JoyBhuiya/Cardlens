import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy notice" updated="12 November 2026">
      <p>
        This notice explains, in plain English, what Cardlens does with your information. Cardlens is operated by [Company name] (&quot;we&quot;), the data
        controller. Contact: [privacy email]. ICO registration number: [pending].
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Your email address, to sign you in and, if you join the waitlist, to tell you about Cardlens.</li>
        <li>The credit card statements you upload, and the transactions we read from them: dates, descriptions, amounts and the last 4 digits of the card.</li>
        <li>Choices you make in the app, such as category corrections and which spending is for business.</li>
      </ul>
      <p>We never ask for bank logins and never connect to your accounts. We never store full card numbers — they are cut to the last 4 digits as soon as a file is read.</p>
      <h2>Why we use it</h2>
      <p>To provide the service you asked for: reading your statements and building your report (performance of a contract). For the waitlist, we rely on your consent, which you can withdraw at any time.</p>
      <h2>Who processes it</h2>
      <ul>
        <li>[Hosting provider] (the server that runs cardlens.brightnext.eu, its database and statement file storage), in [location].</li>
        <li>Mailjet (sends sign-in emails), which receives your email address.</li>
        <li>
          Anthropic (the Claude AI model), which reads statement files to extract transactions and writes the report summary. Statement content is sent
          to Anthropic for processing and is not used to train its models. For the summary we send only aggregated totals, not your transaction descriptions.
          Anthropic may process data outside the UK under appropriate safeguards.
        </li>
      </ul>
      <p>We do not sell your data, show ads or use third-party trackers.</p>
      <h2>How long we keep it</h2>
      <p>
        Uploaded files are deleted as soon as they are processed successfully, unless you choose to keep them. Transactions and reports stay until you
        delete them or your account. You can delete everything at any time from Settings → Delete all my data.
      </p>
      <h2>Your rights</h2>
      <p>
        You can access, correct, export (CSV) or delete your data, object to processing, and complain to the Information Commissioner&apos;s Office
        (ico.org.uk). Contact us at [privacy email].
      </p>
    </LegalLayout>
  );
}
