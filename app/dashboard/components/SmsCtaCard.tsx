/**
 * Click-to-SMS card. Renders a tappable link that pre-fills the dealer's
 * SMS app with our number and a starter message. Mobile = opens native
 * Messages app. Desktop = depends on browser/OS handler (iMessage on Mac,
 * "Messages for web" on Android via paired device, or just nothing).
 *
 * sms: URI format works on both iOS and Android:
 *   sms:<E.164>?body=<encoded text>
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc5724
 *
 * We only render this card when NEXT_PUBLIC_SMS_NUMBER is configured so
 * dealers don't see a dead button before SMS is provisioned in production.
 */

interface SmsCtaCardProps {
  smsNumber: string;
  dealerVertical: string;
}

function exampleUrlForVertical(vertical: string): string {
  switch (vertical) {
    case "automotive":
      return "https://your-dealer-site.com/vehicles/2024-ford-f150";
    case "realestate":
      return "https://your-realty-site.com/listings/123-main-st";
    case "ecommerce":
      return "https://your-store.com/products/sku-1234";
    default:
      return "https://your-site.com/services/deep-cleaning";
  }
}

export function SmsCtaCard({ smsNumber, dealerVertical }: SmsCtaCardProps) {
  const exampleUrl = exampleUrlForVertical(dealerVertical);
  const starterBody = `Hi! Please import this listing: ${exampleUrl}`;
  const smsHref = `sms:${smsNumber}?body=${encodeURIComponent(starterBody)}`;

  // Display the number in a friendlier form: +15555550100 -> (555) 555-0100
  const displayNumber = formatUsNumberForDisplay(smsNumber);

  return (
    <div
      style={{
        border: "1px solid var(--brand-accent, #e5e7eb)",
        borderRadius: 12,
        padding: 20,
        background:
          "linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(168, 85, 247, 0.05))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 28 }} aria-hidden="true">
          💬
        </span>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            Add listings by SMS
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.7 }}>
            Text us any URL from your website and we&apos;ll import it into
            your catalog automatically.
          </p>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <a
          href={smsHref}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#111827",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          📱 Text {displayNumber}
        </a>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          Or save the number and text it from your phone anytime.
        </span>
      </div>
    </div>
  );
}

function formatUsNumberForDisplay(e164: string): string {
  // +1NXXNXXXXXX -> (NXX) NXX-XXXX
  const match = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
  return e164;
}
