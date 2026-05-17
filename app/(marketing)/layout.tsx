import type { ReactNode } from "react";
import Link from "next/link";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Marketing nav */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {/* Inline SVG logo */}
            <svg
              viewBox="0 0 120 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="CIAfeeds"
              className="h-7 w-auto"
            >
              <rect width="28" height="28" rx="6" y="2" fill="#1877F2" />
              <text
                x="14"
                y="21"
                textAnchor="middle"
                fill="white"
                fontSize="16"
                fontWeight="700"
                fontFamily="Arial, sans-serif"
              >
                C
              </text>
              <text
                x="36"
                y="22"
                fill="#0F172A"
                fontSize="14"
                fontWeight="700"
                fontFamily="Arial, sans-serif"
              >
                IAfeeds
              </text>
            </svg>
          </Link>

          <nav className="hidden sm:flex items-center gap-5 text-sm font-medium text-gray-600">
            <Link href="/blog" className="hover:text-blue-600 transition-colors">
              Blog
            </Link>
            <Link
              href="/whatsapp-marketing-dealerships"
              className="hover:text-blue-600 transition-colors"
            >
              WhatsApp Marketing
            </Link>
            <Link
              href="/hispanic-auto-marketing"
              className="hover:text-blue-600 transition-colors"
            >
              Hispanic Auto
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block"
            >
              Log in
            </Link>
            <Link
              href="/lp/whatsapp-marketing-dealerships"
              className="sf-btn text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Marketing footer */}
      <footer className="bg-gray-900 text-gray-400 text-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-white font-semibold mb-2">CIAfeeds</p>
            <p className="text-xs leading-relaxed">
              Meta Catalog feeds &amp; Click-to-WhatsApp lead funnels for US car
              dealerships.
            </p>
          </div>
          <div>
            <p className="text-white font-semibold mb-2">Product</p>
            <ul className="space-y-1">
              <li>
                <Link href="/lp/whatsapp-marketing-dealerships" className="hover:text-white">
                  WhatsApp Leads
                </Link>
              </li>
              <li>
                <Link href="/lp/hispanic-auto-marketing" className="hover:text-white">
                  Hispanic Auto
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white">
                  Log in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-white font-semibold mb-2">Learn</p>
            <ul className="space-y-1">
              <li>
                <Link href="/blog" className="hover:text-white">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/whatsapp-marketing-dealerships" className="hover:text-white">
                  WhatsApp Guide
                </Link>
              </li>
              <li>
                <Link href="/hispanic-auto-marketing" className="hover:text-white">
                  Hispanic Auto Guide
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-white font-semibold mb-2">Company</p>
            <ul className="space-y-1">
              <li>
                <Link href="/privacy" className="hover:text-white">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 text-center text-xs py-4">
          © {new Date().getFullYear()} CIAfeeds ·{" "}
          <a href="https://www.ciafeed.com" className="hover:text-white">
            www.ciafeed.com
          </a>
        </div>
      </footer>
    </>
  );
}
