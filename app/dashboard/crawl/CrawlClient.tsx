"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

interface Snapshot {
  id: string;
  url: string;
  firstSeenAt: string;
  lastSeenAt: string;
  weeksActive: number;
  addedToFeed: boolean;
  make: string | null;
  model: string | null;
  year: number | null;
  price: number | null;
  title: string | null;
  thumbnailUrl: string | null;
}

interface Props {
  dealerName: string;
  vertical: string;
  websiteUrl: string;
  autoCrawlEnabled: boolean;
  quota: { used: number; limit: number; resetsAt: string };
  lastCrawl: { completedAt: string; urlsFound: number } | null;
  initialSnapshots: Snapshot[];
  isImpersonating: boolean;
}

const PAGE_SIZE = 100;

function ageBadge(weeks: number) {
  if (weeks >= 10) {
    return (
      <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
        {weeks} weeks &#9888; Aged
      </span>
    );
  }
  if (weeks >= 5) {
    return (
      <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
        {weeks} weeks
      </span>
    );
  }
  return (
    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
      {weeks} {weeks === 1 ? "week" : "weeks"}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysSince(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatPrice(price: number | null): string {
  if (price == null) return "\u2014";
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function urlSlug(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last).replace(/[-_]+/g, " ");
  } catch {
    return url;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getResetDate(): string {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return nextMonth.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function CrawlClient({
  dealerName,
  vertical,
  websiteUrl,
  autoCrawlEnabled: initialAutoCrawl,
  quota,
  lastCrawl,
  initialSnapshots,
  isImpersonating,
}: Props) {
  const crawlLimitPerMonth = quota.limit;
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots);
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [lastCrawlInfo, setLastCrawlInfo] = useState(lastCrawl);
  const [crawlsUsed, setCrawlsUsed] = useState(quota.used);
  const [autoCrawl, setAutoCrawl] = useState(initialAutoCrawl);
  const [autoCrawlSaving, setAutoCrawlSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [ageFilter, setAgeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [makeFilter, setMakeFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Pagination
  const [page, setPage] = useState(0);

  // Clear results state
  const [clearing, setClearing] = useState(false);

  // Add to feed state
  const [addingToFeed, setAddingToFeed] = useState(false);
  const [addProgress, setAddProgress] = useState<{ done: number; total: number } | null>(null);
  const [addResult, setAddResult] = useState<{ count: number; errors: number; queued: boolean } | null>(null);

  // Crawl progress polling state
  const [crawlJobId, setCrawlJobId] = useState<string | null>(null);
  const [crawlPhase, setCrawlPhase] = useState<"mapping" | "enriching" | "complete" | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<{ found: number; enriched: number } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAutomotive = vertical === "automotive";
  const quotaReached = crawlsUsed >= crawlLimitPerMonth;

  // Derive unique makes for filter dropdown
  const uniqueMakes = useMemo(() => {
    const makes = new Set<string>();
    for (const s of snapshots) {
      if (s.make) makes.add(s.make);
    }
    return [...makes].sort();
  }, [snapshots]);

  // Apply filters
  const filtered = useMemo(() => {
    return snapshots.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        const searchable = [s.url, s.title, s.make, s.model, s.year?.toString()].filter(Boolean).join(" ").toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (ageFilter === "new") {
        if (s.weeksActive !== 1) return false;
      } else if (ageFilter === "2-4") {
        if (s.weeksActive < 2 || s.weeksActive > 4) return false;
      } else if (ageFilter === "5-9") {
        if (s.weeksActive < 5 || s.weeksActive > 9) return false;
      } else if (ageFilter === "10+") {
        if (s.weeksActive < 10) return false;
      }
      if (statusFilter === "not_in_feed" && s.addedToFeed) return false;
      if (statusFilter === "in_feed" && !s.addedToFeed) return false;
      if (makeFilter !== "all") {
        if ((s.make ?? "") !== makeFilter) return false;
      }
      if (priceFilter === "under5k") {
        if (s.price == null || s.price >= 5000) return false;
      } else if (priceFilter === "5k-15k") {
        if (s.price == null || s.price < 5000 || s.price > 15000) return false;
      } else if (priceFilter === "15k-30k") {
        if (s.price == null || s.price < 15000 || s.price > 30000) return false;
      } else if (priceFilter === "30k-50k") {
        if (s.price == null || s.price < 30000 || s.price > 50000) return false;
      } else if (priceFilter === "50k+") {
        if (s.price == null || s.price < 50000) return false;
      } else if (priceFilter === "unknown") {
        if (s.price != null) return false;
      }
      return true;
    });
  }, [snapshots, search, ageFilter, statusFilter, makeFilter, priceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const selectedCount = selectedIds.size;

  async function refreshSnapshots() {
    try {
      const res = await fetch("/api/crawl/snapshots");
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots ?? []);
      }
    } catch {
      // Silently fail — existing state is still usable
    }
  }

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollFailCount = useRef(0);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      pollFailCount.current = 0;
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/crawl/status/${jobId}`);
          if (!res.ok) {
            if (res.status >= 400 && res.status < 500) {
              // Terminal client error — stop polling and surface error
              stopPolling();
              const errMsg = res.status === 401
                ? "Session expired. Please refresh the page and try again."
                : res.status === 404
                  ? "Crawl job not found."
                  : "Crawl status check failed. Please try again.";
              setCrawlError(errMsg);
              setCrawling(false);
              return;
            }
            // Transient 5xx — retry up to 5 times
            pollFailCount.current += 1;
            if (pollFailCount.current >= 5) {
              stopPolling();
              setCrawlError("Lost connection to crawl status. Please try again.");
              setCrawling(false);
            }
            return;
          }
          pollFailCount.current = 0;
          const data = await res.json();

          setCrawlProgress({ found: data.urlsFound, enriched: data.urlsEnriched });
          setCrawlPhase(data.phase);

          if (data.status === "complete") {
            stopPolling();
            setSnapshots(data.snapshots ?? []);
            setLastCrawlInfo({
              completedAt: new Date().toISOString(),
              urlsFound: data.urlsFound ?? 0,
            });
            setSelectedIds(new Set());
            setPage(0);
            setCrawling(false);
            setCrawlPhase("complete");
          } else if (data.status === "failed") {
            stopPolling();
            setCrawlError("Crawl failed. Please try again.");
            setCrawling(false);
          }
        } catch {
          // Network error — retry up to 5 times
          pollFailCount.current += 1;
          if (pollFailCount.current >= 5) {
            stopPolling();
            setCrawlError("Lost connection to crawl status. Please try again.");
            setCrawling(false);
          }
        }
      }, 3000);
    },
    [stopPolling]
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  async function handleCrawl() {
    if (quotaReached) return;
    setCrawling(true);
    setCrawlError(null);
    setAddResult(null);
    setCrawlPhase("mapping");
    setCrawlProgress(null);
    setCrawlJobId(null);

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "no_website_url") {
          setCrawlError("Please set your website URL in Profile settings before crawling.");
          setCrawling(false);
          setCrawlPhase(null);
          return;
        }
        if (data.error === "monthly_limit_reached") {
          setCrawlsUsed(data.used ?? crawlLimitPerMonth);
          setCrawlError(`Monthly crawl limit reached. Resets ${getResetDate()}.`);
          setCrawling(false);
          setCrawlPhase(null);
          return;
        }
        setCrawlError(data.error || "Crawl failed. Please try again.");
        setCrawling(false);
        setCrawlPhase(null);
        return;
      }

      // Mapping done — enrichment is running in the background
      setCrawlJobId(data.crawlJobId);
      setCrawlPhase("enriching");
      setCrawlProgress({ found: data.urlsFound, enriched: 0 });
      if (data.quota?.used != null) {
        setCrawlsUsed(data.quota.used);
      }

      // Start polling for enrichment progress
      startPolling(data.crawlJobId);
    } catch {
      setCrawlError("Network error. Please try again.");
      setCrawling(false);
      setCrawlPhase(null);
    }
  }

  async function handleAutoCrawlToggle() {
    const newValue = !autoCrawl;
    setAutoCrawlSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoCrawlEnabled: newValue }),
      });
      if (res.ok) {
        setAutoCrawl(newValue);
      }
    } catch {
      // Silently fail — toggle stays at old state
    } finally {
      setAutoCrawlSaving(false);
    }
  }

  async function handleClearResults() {
    if (!window.confirm(`This will remove all ${snapshots.length} crawl results. Items already added to your feed will not be affected. Continue?`)) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch("/api/crawl/snapshots", { method: "DELETE" });
      if (res.ok) {
        setSnapshots([]);
        setLastCrawlInfo(null);
      }
    } catch {
      // Silently fail
    } finally {
      setClearing(false);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const allFilteredIds = filtered.filter((s) => !s.addedToFeed).map((s) => s.id);
    setSelectedIds(new Set(allFilteredIds));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleAddToFeed() {
    const selected = snapshots.filter((s) => selectedIds.has(s.id) && !s.addedToFeed);
    if (selected.length === 0) return;

    setAddingToFeed(true);
    setAddResult(null);
    setAddProgress({ done: 0, total: selected.length });
    let successCount = 0;
    let errorCount = 0;

    const endpoint = isAutomotive ? "/api/vehicles/from-url" : "/api/listings/from-url";

    // Process sequentially — one URL at a time to avoid rate-limit bursts
    for (let i = 0; i < selected.length; i++) {
      const snap = selected[i];
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: snap.url }),
        });

        if (res.status === 429) {
          // Rate limited — honor retryAfterMs before retrying
          const data = await res.json().catch(() => ({}));
          const retryMs = data.retryAfterMs ?? 10_000;
          await delay(retryMs);
          // Retry once after waiting
          const retryRes = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: snap.url }),
          });
          if (!retryRes.ok && retryRes.status !== 202) {
            throw new Error(`status ${retryRes.status}`);
          }
          successCount++;
        } else if (!res.ok && res.status !== 202) {
          throw new Error(`status ${res.status}`);
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      }

      setAddProgress({ done: i + 1, total: selected.length });
    }

    // Refresh snapshots from canonical source
    await refreshSnapshots();

    setSelectedIds(new Set());
    setAddProgress(null);
    setAddResult({ count: successCount, errors: errorCount, queued: false });
    setAddingToFeed(false);
  }

  const daysSinceLastCrawl = lastCrawlInfo
    ? daysSince(lastCrawlInfo.completedAt)
    : null;

  // suppress unused vars from props that are kept for future use
  void isImpersonating;
  void crawlJobId;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-indigo-500 hover:text-indigo-600">
              &larr; Dashboard
            </Link>
            <span className="font-bold text-lg text-gray-900">CIAfeeds</span>
          </div>
          <span className="text-sm text-gray-500">{dealerName}</span>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-8">
        {/* Crawl trigger card */}
        <div className="bg-white border border-gray-200 rounded-xl p-7 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Crawl My Website</h2>
          <p className="text-sm text-gray-500 mb-5">
            {isAutomotive
              ? "Discover all vehicle listings on your website at once. We\u2019ll scan your site and show you everything we find \u2014 then you pick what goes into your feed."
              : "Discover all product listings on your website at once. We\u2019ll scan your site and show you everything we find \u2014 then you pick what goes into your feed."}
          </p>

          {/* Website URL (read-only) */}
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-sm text-gray-700">
              <span className="mr-1.5">🌐</span>
              {websiteUrl || <span className="text-gray-400 italic">No website URL set</span>}
            </span>
            <Link
              href="/dashboard/profile"
              className="text-sm text-indigo-500 hover:text-indigo-600 font-medium"
            >
              Change in Profile →
            </Link>
          </div>

          {/* Monthly quota display */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] text-gray-600">
                {crawlsUsed} of {crawlLimitPerMonth} crawls used this month
                <span className="text-gray-400 ml-1.5">· Resets {getResetDate()}</span>
              </span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (crawlsUsed / crawlLimitPerMonth) * 100)}%` }}
              />
            </div>
          </div>

          {/* Crawl button */}
          {quotaReached ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
              Monthly crawl limit reached. Resets {getResetDate()}.
            </p>
          ) : (
            <button
              data-element-id="crawl-btn"
              onClick={handleCrawl}
              disabled={crawling || !websiteUrl}
              className="bg-indigo-600 text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {crawling ? "Crawling\u2026" : "Crawl My Website"}
            </button>
          )}

          {crawlError && (
            <p className="text-sm text-red-600 mt-3">{crawlError}</p>
          )}

          {lastCrawlInfo && (
            <p className="text-[13px] text-gray-400 mt-3">
              Last crawl:{" "}
              <strong>
                {new Date(lastCrawlInfo.completedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </strong>{" "}
              — {lastCrawlInfo.urlsFound} listings found
              {daysSinceLastCrawl !== null && daysSinceLastCrawl >= 7 && (
                <span className="ml-2 inline-block bg-amber-100 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                  {daysSinceLastCrawl} days ago — consider re-crawling
                </span>
              )}
            </p>
          )}

          {/* Auto-crawl toggle */}
          <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Auto-crawl weekly</p>
              <p className="text-[13px] text-gray-500">
                We&apos;ll automatically crawl your site once a week and update your inventory list.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={autoCrawl}
              disabled={autoCrawlSaving}
              onClick={handleAutoCrawlToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                autoCrawl ? "bg-indigo-600" : "bg-gray-200"
              } ${autoCrawlSaving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoCrawl ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Crawl progress card */}
        {crawling && crawlPhase && (
          <div className="bg-white border border-gray-200 rounded-xl p-7 mb-6">
            {/* Bar 1 — URL discovery */}
            <div className="mb-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">
                {crawlPhase === "mapping"
                  ? "Scanning your website for inventory pages..."
                  : crawlPhase === "enriching"
                  ? "Website scan complete"
                  : "Done! Results are ready."}
              </p>
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{
                    width:
                      crawlPhase === "mapping"
                        ? "60%"
                        : "100%",
                  }}
                />
              </div>
              {crawlProgress && crawlProgress.found > 0 && (
                <p className="text-[13px] text-gray-500">
                  {crawlProgress.found} pages found
                </p>
              )}
            </div>

            {/* Bar 2 — Enrichment (only during/after enriching) */}
            {(crawlPhase === "enriching" || crawlPhase === "complete") && crawlProgress && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  {crawlPhase === "enriching"
                    ? "Fetching details for each listing..."
                    : "All listings enriched"}
                </p>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{
                      width:
                        crawlProgress.found > 0
                          ? `${Math.min(100, (crawlProgress.enriched / crawlProgress.found) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
                <p className="text-[13px] text-gray-500">
                  {crawlProgress.enriched} / {crawlProgress.found} listings
                  {crawlProgress.found > 0 && (
                    <span className="ml-1.5">
                      — {Math.round((crawlProgress.enriched / crawlProgress.found) * 100)}% complete
                    </span>
                  )}
                </p>
              </div>
            )}

            <p className="text-[13px] text-gray-400">
              This usually takes 2-4 minutes. You can leave this page and come back — results will be saved.
            </p>
          </div>
        )}

        {/* Results section */}
        {snapshots.length > 0 && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold text-gray-900">
                Crawl Results — {filtered.length} listing{filtered.length !== 1 ? "s" : ""}{" "}
                {filtered.length !== snapshots.length && (
                  <span className="text-sm font-normal text-gray-400">
                    (of {snapshots.length} total)
                  </span>
                )}
              </h1>
              <div className="flex items-center gap-3">
                {lastCrawlInfo && (
                  <span className="text-[13px] text-gray-400">
                    Crawled{" "}
                    {new Date(lastCrawlInfo.completedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    at{" "}
                    {new Date(lastCrawlInfo.completedAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <button
                  onClick={handleClearResults}
                  disabled={clearing}
                  className="text-[13px] border border-red-300 text-red-600 px-3 py-1 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clearing ? "Clearing\u2026" : "Clear Results"}
                </button>
              </div>
            </div>

            {/* Add result banner */}
            {addResult && (
              <div
                className={`rounded-md p-3 mb-3 text-sm ${
                  addResult.errors > 0
                    ? "bg-amber-50 text-amber-800"
                    : "bg-green-50 text-green-800"
                }`}
              >
                {addResult.count} listing{addResult.count !== 1 ? "s" : ""} added to feed.
                {addResult.queued && " Items were queued in batches to respect rate limits."}
                {addResult.errors > 0 &&
                  ` ${addResult.errors} failed — please try again.`}
              </div>
            )}

            {/* Filters */}
            <div className="flex gap-2.5 mb-3 flex-wrap">
              <input
                data-element-id="search-filter"
                type="text"
                className="border border-gray-400 bg-white rounded-md px-2.5 py-1.5 text-[13px] w-[220px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Search title, URL, make, model..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
              <select
                data-element-id="age-filter"
                className="border border-gray-400 bg-white rounded-md px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={ageFilter}
                onChange={(e) => {
                  setAgeFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All Ages</option>
                <option value="new">New this week</option>
                <option value="2-4">2-4 weeks</option>
                <option value="5-9">5-9 weeks</option>
                <option value="10+">10+ weeks (aged)</option>
              </select>
              <select
                data-element-id="status-filter"
                className="border border-gray-400 bg-white rounded-md px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All</option>
                <option value="not_in_feed">Not in feed</option>
                <option value="in_feed">Already in feed</option>
              </select>
              <select
                data-element-id="make-filter"
                className="border border-gray-400 bg-white rounded-md px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={makeFilter}
                onChange={(e) => {
                  setMakeFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All Makes</option>
                {uniqueMakes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                data-element-id="price-filter"
                className="border border-gray-400 bg-white rounded-md px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={priceFilter}
                onChange={(e) => {
                  setPriceFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All Prices</option>
                <option value="under5k">Under $5,000</option>
                <option value="5k-15k">$5,000 - $15,000</option>
                <option value="15k-30k">$15,000 - $30,000</option>
                <option value="30k-50k">$30,000 - $50,000</option>
                <option value="50k+">$50,000+</option>
                <option value="unknown">Unknown price</option>
              </select>
            </div>

            {/* Selection bar */}
            {selectedCount > 0 && (
              <div className="bg-indigo-600 text-white px-5 py-3 rounded-lg mb-3 flex items-center justify-between text-sm">
                <span>
                  <strong>{selectedCount}</strong> listing{selectedCount !== 1 ? "s" : ""} selected
                  {addProgress && (
                    <span className="ml-2 text-indigo-200">
                      — Processing {addProgress.done}/{addProgress.total}...
                    </span>
                  )}
                </span>
                <div className="flex gap-2.5">
                  <button
                    onClick={clearSelection}
                    disabled={addingToFeed}
                    className="bg-white/20 text-white px-3 py-1.5 rounded-md text-[13px] font-semibold hover:bg-white/30 disabled:opacity-50"
                  >
                    Clear
                  </button>
                  <button
                    data-element-id="add-to-feed-btn"
                    onClick={handleAddToFeed}
                    disabled={addingToFeed}
                    className="bg-green-500 text-white px-4 py-1.5 rounded-md text-[13px] font-semibold hover:bg-green-600 disabled:opacity-50"
                  >
                    {addingToFeed
                      ? `Adding (${addProgress?.done ?? 0}/${addProgress?.total ?? selectedCount})...`
                      : `Add ${selectedCount} to Feed`}
                  </button>
                </div>
              </div>
            )}

            {/* Select All button when nothing selected */}
            {selectedCount === 0 && filtered.some((s) => !s.addedToFeed) && (
              <div className="mb-3">
                <button
                  data-element-id="select-all-btn"
                  onClick={selectAll}
                  className="text-[13px] text-indigo-600 font-semibold hover:text-indigo-500"
                >
                  Select all not in feed ({filtered.filter((s) => !s.addedToFeed).length})
                </button>
              </div>
            )}

            {/* Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2.5 w-9">
                      <input
                        type="checkbox"
                        checked={
                          paged.filter((s) => !s.addedToFeed).length > 0 &&
                          paged
                            .filter((s) => !s.addedToFeed)
                            .every((s) => selectedIds.has(s.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const newIds = new Set(selectedIds);
                            paged
                              .filter((s) => !s.addedToFeed)
                              .forEach((s) => newIds.add(s.id));
                            setSelectedIds(newIds);
                          } else {
                            const newIds = new Set(selectedIds);
                            paged.forEach((s) => newIds.delete(s.id));
                            setSelectedIds(newIds);
                          }
                        }}
                      />
                    </th>
                    <th className="text-left px-3 py-2.5 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                      Listing
                    </th>
                    <th className="text-left px-3 py-2.5 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                      Price
                    </th>
                    <th className="text-left px-3 py-2.5 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                      First Seen
                    </th>
                    <th className="text-left px-3 py-2.5 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                      Weeks on Site
                    </th>
                    <th className="text-left px-3 py-2.5 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((snap) => (
                    <tr
                      key={snap.id}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          disabled={snap.addedToFeed}
                          checked={selectedIds.has(snap.id)}
                          onChange={() => toggleSelection(snap.id)}
                        />
                      </td>
                      <td className="px-3 py-2.5 max-w-[360px]">
                        <div className="flex items-center gap-2.5">
                          {snap.thumbnailUrl ? (
                            <img
                              src={snap.thumbnailUrl}
                              alt=""
                              className="w-14 h-[42px] rounded-md object-cover flex-shrink-0 bg-gray-200"
                            />
                          ) : (
                            <div className="w-14 h-[42px] rounded-md bg-gray-200 flex items-center justify-center text-gray-400 text-lg flex-shrink-0">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                              </svg>
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-gray-900 truncate max-w-[280px]" title={snap.title ?? snap.url}>
                              {snap.title || urlSlug(snap.url)}
                            </div>
                            <a
                              href={snap.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-500 text-[11px] hover:underline truncate block max-w-[280px]"
                              title={snap.url}
                            >
                              {snap.url.replace(/^https?:\/\//, "")}
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-gray-600 whitespace-nowrap">
                        {formatPrice(snap.price)}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-gray-600">
                        {formatDate(snap.firstSeenAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        {ageBadge(snap.weeksActive)}
                      </td>
                      <td className="px-3 py-2.5">
                        {snap.addedToFeed ? (
                          <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                            In feed
                          </span>
                        ) : (
                          <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            Not in feed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-sm text-gray-400"
                      >
                        No results match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-[13px] text-gray-500">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-[13px] border border-gray-400 bg-white rounded-md disabled:opacity-40 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 text-[13px] border border-gray-400 bg-white rounded-md disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state when no snapshots */}
        {snapshots.length === 0 && !crawling && (
          <div className="bg-white rounded-lg border border-gray-100 p-8 text-center">
            <p className="text-gray-500 text-sm">
              No crawl results yet. Enter your website URL above and click
              &ldquo;Crawl My Website&rdquo; to discover your inventory listings.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
