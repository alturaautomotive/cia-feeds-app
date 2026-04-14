"use client";

import { useState } from "react";
import { VERTICAL_LABELS, VERTICAL_META_TYPE, type Vertical } from "@/lib/verticals";

const FEED_SECTION_LABEL: Record<string, string> = {
  automotive: "Vehicle Feed URL",
  services: "Services Feed URL",
  ecommerce: "Products Feed URL",
  realestate: "Listings Feed URL",
};

interface FeedUrlCardProps {
  feedUrl: string;
  vertical: string;
}

export default function FeedUrlCard({ feedUrl, vertical }: FeedUrlCardProps) {
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
  );
}
