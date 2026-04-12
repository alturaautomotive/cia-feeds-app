import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CIAfeeds — Meta Catalog Feeds for Any Business",
  description: "Generate Meta-compatible catalog feed CSVs for automotive, real estate, and services",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <footer className="text-center text-xs text-gray-400 py-4 border-t border-gray-100 bg-white mt-auto">
          © {new Date().getFullYear()} CIAfeeds ·{" "}
          <Link href="/privacy" className="hover:text-gray-600">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-gray-600">
            Terms of Service
          </Link>
        </footer>
      </body>
    </html>
  );
}
