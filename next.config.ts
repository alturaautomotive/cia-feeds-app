import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * Refs:
 *  - https://owasp.org/www-project-secure-headers/
 *  - https://web.dev/articles/security-headers
 *  - SECURITY_AUDIT.md F-5.1
 *
 * CSP is currently in Report-Only mode while we tune it. Sources allowed:
 *   - 'self' (own origin)
 *   - Supabase (storage + edge functions) for images and API calls
 *   - Stripe (Elements JS + API)
 *   - Meta / Facebook (Pixel + Conversions API + Graph)
 *   - Google Maps (maps & geocoding for dealer addresses)
 *   - data: + blob: URIs for client-side image previews
 *
 * Inline scripts are still allowed via 'unsafe-inline' because Next.js
 * injects framework boot inline. Once we migrate to a nonce-based pattern,
 * remove 'unsafe-inline' from script-src and enable Report-Only → Enforcing.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://www.facebook.com",
  "img-src 'self' data: blob: https: https://*.supabase.co https://graph.facebook.com https://*.fbcdn.net https://*.googleusercontent.com https://maps.googleapis.com https://maps.gstatic.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://connect.facebook.net https://maps.googleapis.com",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://graph.facebook.com https://www.facebook.com https://maps.googleapis.com https://api.openai.com https://generativelanguage.googleapis.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.facebook.com",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Strict-Transport-Security — Vercel already adds this; we set it explicitly
  // with includeSubDomains + preload for parity across deploys.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Clickjacking protection (legacy header still honored by older browsers).
  // Modern browsers use frame-ancestors in CSP above, but both are cheap.
  { key: "X-Frame-Options", value: "DENY" },
  // MIME-sniffing protection — required for uploaded images served from
  // the public Supabase bucket to not be misinterpreted.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the full referrer to third parties.
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // Disable browser features we never use.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(self), payment=(self), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), midi=(), interest-cohort=()",
  },
  // CSP in Report-Only first so we can see what would have broken without
  // actually breaking anything. Switch to "Content-Security-Policy" after
  // monitoring for a few days with no violations from real user paths.
  {
    key: "Content-Security-Policy-Report-Only",
    value: csp,
  },
  // Cross-Origin Opener Policy — isolates window references to prevent
  // Spectre-style cross-origin attacks.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every route.
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
