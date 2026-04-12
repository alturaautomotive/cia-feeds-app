import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — CIAfeeds",
  description: "How CIAfeeds collects, uses, and protects your data.",
};

export default function PrivacyPolicy() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <Link
        href="/dashboard"
        className="text-indigo-600 hover:text-indigo-800 text-sm mb-8 inline-block"
      >
        &larr; Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">
        Effective Date: April 12, 2026
      </p>

      {/* 1. Introduction */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          1. Introduction
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          Welcome to CIAfeeds (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). CIAfeeds is an
          AI-powered platform that helps businesses generate Meta-compatible
          catalog feeds for the automotive, real estate, and services verticals.
          This Privacy Policy explains how we collect, use, disclose, and
          protect your personal information when you use our website and
          services. By accessing or using CIAfeeds, you agree to the practices
          described in this policy. If you have any questions or concerns,
          please contact us at{" "}
          <a
            href="mailto:privacy@ciafeed.com"
            className="text-indigo-600 hover:underline"
          >
            privacy@ciafeed.com
          </a>
          .
        </p>
      </section>

      {/* 2. Information We Collect */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          2. Information We Collect
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">
          We collect information that you provide directly to us, as well as
          information generated through your use of our services:
        </p>
        <ul className="list-disc list-inside text-gray-700 text-sm leading-relaxed space-y-2">
          <li>
            <strong>Account Information:</strong> When you create an account, we
            collect your name, email address, and a securely hashed version of
            your password. We never store plaintext passwords.
          </li>
          <li>
            <strong>Business Information:</strong> To configure your catalog
            feeds, we collect your dealer or business name, physical address,
            website URL, and business vertical selection.
          </li>
          <li>
            <strong>Vehicle &amp; Listing Data:</strong> You may provide details
            about vehicles, properties, or service listings, including titles,
            descriptions, prices, images, and other attributes relevant to your
            catalog feed.
          </li>
          <li>
            <strong>Voice Transcripts:</strong> If you use our voice-to-listing
            feature, audio recordings are sent to OpenAI for transcription
            via the Whisper API. The raw audio is not permanently stored on
            our servers. Retention of audio data by OpenAI is governed by
            OpenAI&apos;s own data usage and retention policies, which we
            encourage you to review at{" "}
            <a
              href="https://openai.com/policies/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              openai.com/policies/privacy-policy
            </a>
            .
          </li>
          <li>
            <strong>Meta Integration Tokens:</strong> When you connect your Meta
            Business Manager account, we store encrypted access tokens to
            publish catalog feeds on your behalf. These tokens are encrypted at
            rest and are deleted immediately when you disconnect your Meta
            account.
          </li>
          <li>
            <strong>Payment Information:</strong> Subscription payments are
            processed by Stripe. We do not store your credit card number or
            full payment details on our servers. Stripe handles all payment
            data in accordance with PCI-DSS standards.
          </li>
        </ul>
      </section>

      {/* 3. How We Use Your Information */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          3. How We Use Your Information
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">
          We use the information we collect for the following purposes:
        </p>
        <ul className="list-disc list-inside text-gray-700 text-sm leading-relaxed space-y-2">
          <li>
            <strong>Catalog Feed Generation:</strong> To create and maintain
            Meta-compatible catalog feed CSV files for your business listings.
          </li>
          <li>
            <strong>AI-Assisted Listing Creation:</strong> To process voice
            recordings and extract structured listing data using artificial
            intelligence, providing you with pre-filled listing fields for
            review and editing.
          </li>
          <li>
            <strong>Subscription Billing:</strong> To manage your subscription
            plan, process payments, and send billing-related communications.
          </li>
          <li>
            <strong>Email Notifications:</strong> To send transactional emails
            such as account verification, password resets, subscription
            confirmations, and important service updates.
          </li>
          <li>
            <strong>Service Improvement:</strong> To analyze usage patterns
            (in aggregate and anonymized form) to improve the reliability,
            performance, and features of our platform.
          </li>
        </ul>
      </section>

      {/* 4. Third-Party Services */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          4. Third-Party Services
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">
          We rely on trusted third-party providers to deliver our services. Each
          provider processes only the data necessary for its specific function:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border border-gray-200 rounded">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 font-semibold text-gray-700 border-b">
                  Provider
                </th>
                <th className="px-4 py-2 font-semibold text-gray-700 border-b">
                  Purpose
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b">
                <td className="px-4 py-2">Supabase</td>
                <td className="px-4 py-2">Database hosting &amp; file storage</td>
              </tr>
              <tr className="border-b">
                <td className="px-4 py-2">Vercel</td>
                <td className="px-4 py-2">Application hosting &amp; deployment</td>
              </tr>
              <tr className="border-b">
                <td className="px-4 py-2">OpenAI</td>
                <td className="px-4 py-2">Voice transcription (Whisper API)</td>
              </tr>
              <tr className="border-b">
                <td className="px-4 py-2">Google</td>
                <td className="px-4 py-2">Gemini AI &amp; Geocoding APIs</td>
              </tr>
              <tr className="border-b">
                <td className="px-4 py-2">Meta / Facebook</td>
                <td className="px-4 py-2">Catalog feed integration &amp; publishing</td>
              </tr>
              <tr className="border-b">
                <td className="px-4 py-2">Stripe</td>
                <td className="px-4 py-2">Payment processing</td>
              </tr>
              <tr>
                <td className="px-4 py-2">Resend</td>
                <td className="px-4 py-2">Transactional email delivery</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed mt-3">
          We encourage you to review the privacy policies of these third-party
          services, as their handling of your data is governed by their own
          terms.
        </p>
      </section>

      {/* 5. Data Retention */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          5. Data Retention
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          We retain your account and business data for as long as your account
          is active. If you choose to delete your account, we will remove your
          personal data within 30 days, except where retention is required by
          law or for legitimate business purposes (such as resolving disputes
          or enforcing our agreements). Voice transcripts are processed in real
          time and are not permanently stored. Meta access tokens are deleted
          immediately upon disconnection of your Meta Business Manager account.
        </p>
      </section>

      {/* 6. Cookies & Tracking */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          6. Cookies &amp; Tracking
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          CIAfeeds uses session cookies managed by NextAuth.js to maintain your
          authenticated session. These cookies are strictly necessary for the
          operation of the service and expire when your session ends or after a
          set period of inactivity. We do not use third-party advertising
          cookies, tracking pixels, or analytics services that track individual
          users across websites. We do not sell, rent, or share your data with
          advertisers.
        </p>
      </section>

      {/* 7. GDPR Rights */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          7. Your Rights Under the GDPR (European Users)
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">
          If you are located in the European Economic Area (EEA), you have the
          following rights under the General Data Protection Regulation:
        </p>
        <ul className="list-disc list-inside text-gray-700 text-sm leading-relaxed space-y-2">
          <li>
            <strong>Right of Access:</strong> You may request a copy of the
            personal data we hold about you.
          </li>
          <li>
            <strong>Right to Rectification:</strong> You may request that we
            correct inaccurate or incomplete personal data.
          </li>
          <li>
            <strong>Right to Erasure:</strong> You may request that we delete
            your personal data, subject to legal retention obligations.
          </li>
          <li>
            <strong>Right to Data Portability:</strong> You may request a
            machine-readable copy of your data to transfer to another service.
          </li>
          <li>
            <strong>Right to Object:</strong> You may object to the processing
            of your personal data for certain purposes.
          </li>
        </ul>
        <p className="text-gray-700 text-sm leading-relaxed mt-3">
          To exercise any of these rights, please contact us at{" "}
          <a
            href="mailto:privacy@ciafeed.com"
            className="text-indigo-600 hover:underline"
          >
            privacy@ciafeed.com
          </a>
          . We will respond to your request within 30 days.
        </p>
      </section>

      {/* 8. CCPA Rights */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          8. Your Rights Under the CCPA (California Users)
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">
          If you are a California resident, the California Consumer Privacy Act
          grants you the following rights:
        </p>
        <ul className="list-disc list-inside text-gray-700 text-sm leading-relaxed space-y-2">
          <li>
            <strong>Right to Know:</strong> You may request information about
            the categories and specific pieces of personal data we have
            collected about you, as well as the purposes for which it is used.
          </li>
          <li>
            <strong>Right to Delete:</strong> You may request the deletion of
            personal data we have collected from you, subject to certain
            exceptions.
          </li>
          <li>
            <strong>Right to Opt-Out of Sale:</strong> CIAfeeds does not sell
            your personal information to third parties. As such, there is no
            need to opt out. If our practices change in the future, we will
            provide a &quot;Do Not Sell My Personal Information&quot; mechanism.
          </li>
        </ul>
        <p className="text-gray-700 text-sm leading-relaxed mt-3">
          To exercise these rights, contact us at{" "}
          <a
            href="mailto:privacy@ciafeed.com"
            className="text-indigo-600 hover:underline"
          >
            privacy@ciafeed.com
          </a>
          .
        </p>
      </section>

      {/* 9. Data Security */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          9. Data Security
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          We take the security of your data seriously and implement
          industry-standard measures to protect it. All data in transit is
          encrypted via HTTPS/TLS. Data at rest in our Supabase database is
          encrypted using AES-256 encryption. Meta access tokens are stored
          using additional application-level encryption. Access to production
          systems is restricted to authorized personnel and protected by
          multi-factor authentication. While no method of transmission or
          storage is 100% secure, we continuously monitor and improve our
          security practices.
        </p>
      </section>

      {/* 10. Children's Privacy */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          10. Children&apos;s Privacy
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          CIAfeeds is a business-to-business service and is not directed to
          individuals under the age of 13. We do not knowingly collect personal
          information from children under 13. If we become aware that we have
          inadvertently collected personal data from a child under 13, we will
          take steps to delete that information promptly. If you believe a
          child under 13 has provided us with personal data, please contact us
          at{" "}
          <a
            href="mailto:privacy@ciafeed.com"
            className="text-indigo-600 hover:underline"
          >
            privacy@ciafeed.com
          </a>
          .
        </p>
      </section>

      {/* 11. Changes to This Policy */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          11. Changes to This Policy
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          We may update this Privacy Policy from time to time to reflect
          changes in our practices, technology, legal requirements, or other
          factors. If we make material changes, we will notify you by email
          (using the address associated with your account) or by posting a
          prominent notice on our website prior to the change becoming
          effective. We encourage you to review this policy periodically for
          the latest information on our privacy practices. Your continued use
          of the service after any changes constitutes your acceptance of the
          updated policy.
        </p>
      </section>

      {/* 12. Contact */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          12. Contact Us
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          If you have any questions, concerns, or requests regarding this
          Privacy Policy or our data practices, please contact us at:
        </p>
        <p className="text-gray-700 text-sm leading-relaxed mt-2">
          <strong>CIAfeeds</strong>
          <br />
          Email:{" "}
          <a
            href="mailto:privacy@ciafeed.com"
            className="text-indigo-600 hover:underline"
          >
            privacy@ciafeed.com
          </a>
        </p>
      </section>
    </main>
  );
}
