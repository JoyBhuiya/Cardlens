import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
import { LEGAL } from "@/lib/legal";
import { retentionSchedule } from "@/lib/retention-policy";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  const schedule = retentionSchedule();
  return (
    <LegalLayout title="Privacy notice" updated={LEGAL.privacyUpdated}>
      <p>
        This notice explains, in plain English, what Cardlens does with your information. Cardlens is operated by {LEGAL.companyName} (&quot;we&quot;),
        the data controller. Contact: {LEGAL.privacyEmail}. ICO registration number: {LEGAL.icoNumber}.
      </p>
      <p>
        {LEGAL.euRepresentative
          ? `Our representative in the EU is ${LEGAL.euRepresentative}.`
          : "Cardlens is offered to people in the UK and reads UK card statements in pounds sterling."}
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your email address, to sign you in and send messages about your account (such as a warning before inactive data is deleted).</li>
        <li>The credit card statements you upload, and the transactions we read from them: dates, descriptions, amounts and the last 4 digits of the card.</li>
        <li>Choices you make in the app, such as category corrections and which spending is for business.</li>
        <li>If you buy a plan: which plan, when it started and ends, and Stripe&apos;s reference numbers. We never see or store your card details.</li>
        <li>If you join the waitlist: your email address, which group you belong to and how many cards you have.</li>
        <li>
          To stop abuse, a one-way scrambled (hashed) form of your IP address in short-lived counters. We don&apos;t store your IP address or browser
          details with your account or sessions.
        </li>
      </ul>
      <p>
        We never ask for bank logins and never connect to your accounts. Full card numbers are cut to the last 4 digits as soon as a file is read.
      </p>

      <h2>Spending can reveal sensitive things</h2>
      <p>
        Card transactions can show things about you that the law treats as especially sensitive, for example payments to a pharmacy, a place of
        worship, a trade union or a political party. We use your transactions only to build your own report. We don&apos;t look for, profile or
        share these details. Categories describe what kind of spending a line is (for example &quot;Health and pharmacy&quot;), not anything about you.
      </p>

      <h2>Why we use it (lawful bases)</h2>
      <ul>
        <li>
          <strong>To provide the service you asked for</strong> (contract): signing you in, reading your statements, building your report, account
          emails and, if you buy a plan, taking payment.
        </li>
        <li>
          <strong>Because the law requires it</strong> (legal obligation): keeping payment and tax records.
        </li>
        <li>
          <strong>To keep Cardlens secure</strong> (legitimate interests): rate limits, spend limits and short server logs to stop abuse.
        </li>
        <li>
          <strong>The waitlist</strong> (consent): you can ask us to remove you at any time.
        </li>
      </ul>

      <h2>How AI is used</h2>
      <p>
        Cardlens uses Anthropic&apos;s Claude AI to read PDF statements into transactions, to suggest a category for merchants it doesn&apos;t
        recognise, and to write the summary in your report. Every number in your report is calculated by our code from your reconciled transactions;
        the AI only writes words around those numbers, and we check every £ figure it writes. The summary is labelled as written with AI. No decision
        with legal or similarly significant effects is made about you by AI or by any automated process.
      </p>

      <h2>Who processes it for us</h2>
      <ul>
        <li>
          {LEGAL.hostingProvider} (the server that runs Cardlens, its database and statement file storage), in {LEGAL.hostingLocation}.
        </li>
        <li>Mailjet, which sends our emails and receives your email address.</li>
        <li>
          Anthropic, which provides the Claude AI. Statement content is sent to Anthropic to be read; for the summary we send only aggregated totals,
          not your transaction descriptions. Anthropic doesn&apos;t use it to train its models. Anthropic processes data in the United States, under its
          data processing terms with the UK International Data Transfer Addendum and the EU Standard Contractual Clauses.
        </li>
        <li>
          Stripe, if you buy a plan. Stripe receives your email address and payment details directly and may process data outside the UK under
          appropriate safeguards.
        </li>
      </ul>
      <p>We do not sell your data, show ads or use third-party trackers or analytics. We only set the cookie that keeps you signed in.</p>

      <h2>How long we keep it</h2>
      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr>
            <th className="border-b border-border py-2 pr-4 text-left align-top font-semibold">What</th>
            <th className="border-b border-border py-2 text-left align-top font-semibold">How long</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((r) => (
            <tr key={r.what}>
              <td className="border-b border-border py-2 pr-4 align-top">{r.what}</td>
              <td className="border-b border-border py-2 align-top text-muted">{r.kept}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>You can delete everything at any time from Settings → Delete all my data. That also cancels any subscription.</p>

      <h2>Your rights</h2>
      <ul>
        <li>See the data we hold, or download it all (Settings → Download all my data).</li>
        <li>Correct it: change categories and business flags in the app, or ask us.</li>
        <li>Delete it (Settings → Delete all my data), or ask us to restrict or stop using it.</li>
        <li>Object to processing based on legitimate interests, and withdraw consent for the waitlist.</li>
      </ul>
      <p>Email {LEGAL.privacyEmail}. We reply within one month, and tell you if we need longer.</p>

      <h2>Complaints</h2>
      <p>
        If you&apos;re unhappy with how we handle your data, please tell us first at {LEGAL.privacyEmail}. We acknowledge complaints within 30 days,
        look into them without delay and tell you the outcome. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk,
        0303 123 1113).
      </p>

      <h2>Keeping it safe</h2>
      <p>
        Encrypted connections (HTTPS), each person&apos;s data separated at database level, statement files readable only by the app and deleted
        after reading, no third-party scripts, and limits that stop runaway use. If a breach is likely to put you at risk, we will tell you and the
        ICO as the law requires.
      </p>

      <h2>Changes</h2>
      <p>We&apos;ll show the date of any change at the top of this page, and email you about important ones.</p>
    </LegalLayout>
  );
}
