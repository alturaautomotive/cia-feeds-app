"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { VERTICAL_LABELS, VERTICAL_META_TYPE, type Vertical } from "@/lib/verticals";

const BACK_LABEL: Record<string, string> = {
  automotive: "Vehicles",
  services: "Services",
  ecommerce: "Products",
  realestate: "Listings",
};

const FEED_SECTION_LABEL: Record<string, string> = {
  automotive: "Vehicle Feed URL",
  services: "Services Feed URL",
  ecommerce: "Products Feed URL",
  realestate: "Listings Feed URL",
};

interface FeedUrlCardProps {
  feedUrl: string;
  userName: string;
  vertical: string;
}

export default function FeedUrlCard({ feedUrl, userName, vertical }: FeedUrlCardProps) {
  const [copied, setCopied] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
    } catch {
      const input = document.createElement("input");
      input.value = feedUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload() {
    setDownloadError(null);
    let objectUrl: string | null = null;
    try {
      const res = await fetch(feedUrl);
      if (!res.ok) {
        setDownloadError(`Download failed: ${res.status} ${res.statusText}`);
        return;
      }
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "feed.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Download failed. Please try again."
      );
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              &larr; {BACK_LABEL[vertical] ?? "Dashboard"}
            </Link>
            <span className="font-bold text-lg text-gray-900">CIAfeeds</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{userName}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Your Meta Catalog Feed
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Use this URL in Meta&apos;s catalog setup to power your{" "}
          {VERTICAL_LABELS[vertical as Vertical] ?? vertical} catalog feed.
        </p>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-7">
          {/* Feed URL section */}
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            {FEED_SECTION_LABEL[vertical] ?? "Feed URL"}
          </p>
          <div className="flex gap-2 items-center mb-5">
            <div
              data-element-id="feed-url-display"
              className="flex-1 bg-gray-100 border border-gray-200 rounded-md px-3 py-2.5 text-sm text-gray-700 font-mono break-all"
            >
              {feedUrl}
            </div>
            <button
              data-element-id="copy-feed-url-btn"
              onClick={handleCopy}
              className={`whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-semibold text-white transition-colors ${
                copied
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {copied ? "Copied!" : "Copy URL"}
            </button>
            <button
              data-element-id="download-feed-csv-btn"
              onClick={handleDownload}
              className="whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              Download CSV
            </button>
          </div>

          {downloadError && (
            <p className="text-sm text-red-600 mb-4">{downloadError}</p>
          )}

          <hr className="border-gray-200 mb-5" />

          {/* Instructions */}
          <p className="text-sm font-bold text-gray-800 mb-3">
            How to use this in Meta
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
            <li>
              Go to{" "}
              <strong>Meta Business Manager → Catalog Manager</strong>.
            </li>
            <li>
              Create a new catalog &rarr; choose <strong>{VERTICAL_META_TYPE[vertical as Vertical] ?? "Automotive"}</strong>.
            </li>
            <li>
              Select <strong>Data Feed → Scheduled Feed</strong>.
            </li>
            <li>
              Paste the URL above and set a refresh schedule (daily
              recommended).
            </li>
            <li>
              Meta will automatically map the columns to its{" "}
              {VERTICAL_LABELS[vertical as Vertical] ?? vertical} catalog fields.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
