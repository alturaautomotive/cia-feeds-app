import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — CIAfeeds",
  description: "Terms and conditions for using CIAfeeds.",
};

export default function TermsOfService() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <Link
        href="/dashboard"
        className="text-indigo-600 hover:text-indigo-800 text-sm mb-8 inline-block"
      >
        &larr; Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Terms of Service
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        Effective Date: April 12, 2026
      </p>

      {/* 1. Acceptance */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          1. Acceptance of Terms
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          By accessing or using CIAfeeds (&quot;the Service&quot;), you agree to be
          bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to
          all of these Terms, you may not access or use the Service. These
          Terms constitute a legally binding agreement between you and CIAfeeds.
          We reserve the right to update or modify these Terms at any time, and
          any changes will be effective upon posting to this page. Your
          continued use of the Service after any changes constitutes acceptance
          of the revised Terms.
        </p>
      </section>

      {/* 2. Service Description */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          2. Service Description
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          CIAfeeds is an AI-powered platform designed to help businesses
          generate Meta-compatible catalog feed CSV files. The Service supports
          automotive, real estate, and services verticals. Key features include
          AI-assisted voice-to-listing creation (using speech-to-text
          transcription and AI field extraction), manual listing management,
          automated catalog feed generation, and direct integration with Meta
          Business Manager for catalog publishing. The Service is provided as a
          Software-as-a-Service (SaaS) platform accessible via web browser.
        </p>
      </section>

      {/* 3. Eligibility */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          3. Eligibility
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          To use CIAfeeds, you must be at least 18 years of age and either a
          business entity or an authorized representative of a business entity.
          By creating an account, you represent and warrant that you meet these
          eligibility requirements and that you have the authority to bind the
          business entity to these Terms. If you are using the Service on
          behalf of an organization, you agree to these Terms on behalf of
          that organization and represent that you have the authority to do so.
        </p>
      </section>

      {/* 4. Account Responsibilities */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          4. Account Responsibilities
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          You are responsible for maintaining the confidentiality of your
          account credentials, including your email address and password. You
          agree to provide accurate, current, and complete business information
          during the registration process and to update such information as
          necessary. Each business should maintain only one account. You are
          responsible for all activities that occur under your account. You must
          notify us immediately at{" "}
          <a
            href="mailto:legal@ciafeed.com"
            className="text-indigo-600 hover:underline"
          >
            legal@ciafeed.com
          </a>{" "}
          if you become aware of any unauthorized use of your account or any
          other breach of security.
        </p>
      </section>

      {/* 5. Subscription & Billing */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          5. Subscription &amp; Billing
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          CIAfeeds offers paid subscription plans with varying features and
          listing limits. All payments are processed securely through Stripe.
          Subscriptions automatically renew at the end of each billing period
          (monthly or annually, depending on your selected plan) unless you
          cancel before the renewal date. Cancellations take effect at the end
          of the current billing period — you will continue to have access to
          the Service until that time. No refunds are provided for partial
          billing periods. We reserve the right to change subscription pricing
          with 30 days&apos; notice. Continued use of the Service after a price
          change constitutes acceptance of the new pricing.
        </p>
      </section>

      {/* 6. Acceptable Use */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          6. Acceptable Use
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">
          You agree to use CIAfeeds only for lawful purposes and in accordance
          with these Terms. You agree not to:
        </p>
        <ul className="list-disc list-inside text-gray-700 text-sm leading-relaxed space-y-2">
          <li>
            Scrape, harvest, or collect data from competitors or other
            third-party sources using the Service.
          </li>
          <li>
            Create or publish fraudulent, misleading, or deceptive listings.
          </li>
          <li>
            Attempt to circumvent rate limits, usage quotas, or other technical
            restrictions imposed by the Service.
          </li>
          <li>
            Use the Service in any way that violates Meta&apos;s Platform Policies,
            Commerce Policies, or Advertising Standards.
          </li>
          <li>
            Reverse engineer, decompile, or disassemble any portion of the
            Service.
          </li>
          <li>
            Use the Service to transmit viruses, malware, or other harmful
            code.
          </li>
          <li>
            Share your account credentials with unauthorized third parties or
            allow multiple users to access the Service under a single account
            without authorization.
          </li>
        </ul>
      </section>

      {/* 7. Intellectual Property */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          7. Intellectual Property
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          CIAfeeds and its licensors retain all rights, title, and interest in
          and to the Service, including all software, algorithms, user
          interface designs, documentation, and related intellectual property.
          You retain full ownership of your listing data, business information,
          images, and other content that you upload or create using the
          Service. By using the Service, you grant CIAfeeds a limited,
          non-exclusive, royalty-free license to process, format, and transmit
          your data solely for the purpose of generating and publishing catalog
          feeds on your behalf. This license terminates when you delete your
          data or close your account.
        </p>
      </section>

      {/* 8. Meta Integration */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          8. Meta Integration
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          CIAfeeds integrates with Meta Business Manager to publish catalog
          feeds on your behalf. You are solely responsible for ensuring that
          your listings and business practices comply with Meta&apos;s Terms of
          Service, Commerce Policies, and Advertising Standards. CIAfeeds acts
          as a technical intermediary and is not liable for any catalog
          rejections, ad account restrictions, or other actions taken by Meta
          in relation to your account or listings. You acknowledge that Meta
          may change its policies or APIs at any time, which may affect the
          functionality of our integration.
        </p>
      </section>

      {/* 9. AI-Generated Content */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          9. AI-Generated Content
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          CIAfeeds uses artificial intelligence to transcribe voice recordings
          and extract structured listing data. All AI-generated content,
          including transcriptions and auto-populated listing fields, are
          provided as suggestions only. You are solely responsible for
          reviewing, editing, and verifying the accuracy of all AI-generated
          content before publishing it to your catalog feed or Meta catalog.
          CIAfeeds does not guarantee the accuracy, completeness, or
          suitability of any AI-generated content.
        </p>
      </section>

      {/* 10. Disclaimers */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          10. Disclaimers
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
          WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT
          LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON-INFRINGEMENT. CIAFEEDS DOES NOT WARRANT
          THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. WE
          DO NOT GUARANTEE THAT YOUR CATALOG FEEDS WILL BE APPROVED BY META,
          THAT YOUR LISTINGS WILL GENERATE ANY PARTICULAR LEVEL OF
          ADVERTISING PERFORMANCE, OR THAT THE AI-GENERATED CONTENT WILL BE
          ACCURATE OR COMPLETE. YOU USE THE SERVICE AT YOUR OWN RISK.
        </p>
      </section>

      {/* 11. Limitation of Liability */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          11. Limitation of Liability
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CIAFEEDS AND ITS
          OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
          DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, REVENUE,
          DATA, OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR RELATED TO YOUR
          USE OF THE SERVICE. IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU
          EXCEED THE AGGREGATE AMOUNT OF FEES PAID BY YOU TO CIAFEEDS DURING
          THE THREE (3) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO
          THE CLAIM. THIS LIMITATION APPLIES REGARDLESS OF THE THEORY OF
          LIABILITY, WHETHER IN CONTRACT, TORT, STRICT LIABILITY, OR
          OTHERWISE.
        </p>
      </section>

      {/* 12. Termination */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          12. Termination
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          Either party may terminate this agreement at any time. You may cancel
          your subscription and close your account through the Service
          dashboard or by contacting us at{" "}
          <a
            href="mailto:legal@ciafeed.com"
            className="text-indigo-600 hover:underline"
          >
            legal@ciafeed.com
          </a>
          . CIAfeeds reserves the right to suspend or terminate your account
          immediately, without prior notice, if you violate these Terms or
          engage in activity that could harm the Service, other users, or third
          parties. Upon termination, your right to use the Service ceases
          immediately. You will have 30 days following termination to export
          your listing data. After this period, we may permanently delete your
          data in accordance with our Privacy Policy.
        </p>
      </section>

      {/* 13. Governing Law */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          13. Governing Law &amp; Dispute Resolution
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          These Terms shall be governed by and construed in accordance with the
          laws of the State of Delaware, United States, without regard to its
          conflict of law principles. Any dispute, controversy, or claim
          arising out of or relating to these Terms or the Service shall be
          resolved through binding arbitration administered by the American
          Arbitration Association (AAA) in accordance with its Commercial
          Arbitration Rules. The arbitration shall take place in the State of
          Delaware or remotely at the mutual agreement of both parties. The
          arbitrator&apos;s decision shall be final and binding. Each party shall
          bear its own costs and attorney fees, unless the arbitrator
          determines otherwise.
        </p>
      </section>

      {/* 14. Contact */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          14. Contact Us
        </h2>
        <p className="text-gray-700 text-sm leading-relaxed">
          If you have any questions or concerns about these Terms of Service,
          please contact us at:
        </p>
        <p className="text-gray-700 text-sm leading-relaxed mt-2">
          <strong>CIAfeeds</strong>
          <br />
          Email:{" "}
          <a
            href="mailto:legal@ciafeed.com"
            className="text-indigo-600 hover:underline"
          >
            legal@ciafeed.com
          </a>
        </p>
      </section>
    </main>
  );
}
